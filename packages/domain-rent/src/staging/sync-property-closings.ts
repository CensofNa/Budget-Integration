import { PrismaClient } from "@prisma/client";
import { EntrataReportsConnector } from "@budget-integration/connector-entrata";
import {
  asObject,
  asArray,
  getString,
  getStringOrNull,
  parseDate,
} from "@budget-integration/integration-core";

export interface SyncPropertyClosingsInput {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
  propertyIds?: string[];
}

export interface SyncPropertyClosingsResult {
  success: boolean;
  syncedCount: number;
  errors: string[];
}

export async function syncPropertyClosings(
  prisma: PrismaClient,
  input: SyncPropertyClosingsInput
): Promise<SyncPropertyClosingsResult> {
  const errors: string[] = [];
  let syncedCount = 0;

  // 1. Resolve source config
  const source = await prisma.integrationSource.findFirst({
    where: {
      id: input.integrationSourceId,
      companyId: input.companyId,
      organisationId: input.organisationId,
      isActive: true,
      sourceType: "entrata",
    },
    include: {
      config: true,
    },
  });

  if (!source || !source.config) {
    throw new Error("No active Entrata integration source config found.");
  }

  const credentials = source.config.credentialsJson as any;
  const connection = source.config.connectionJson as any;

  // Resolve API key
  let apiKey = credentials?.apiKey;
  if (!apiKey && credentials?.apiKeyRef) {
    const ref = credentials.apiKeyRef;
    if (ref.startsWith("env://")) {
      apiKey = process.env[ref.replace("env://", "")];
    }
  }
  if (!apiKey) {
    apiKey = process.env.ENTRATA_API_KEY;
  }
  if (!apiKey) {
    throw new Error("Entrata API key not configured.");
  }

  const baseUrl = connection?.baseUrl || "https://apis.entrata.com";
  const orgSlug = connection?.orgSlug;

  if (!orgSlug) {
    throw new Error("Entrata orgSlug is missing in connection config.");
  }

  // 2. Resolve properties to sync
  let propertyCodes: string[] = [];
  if (input.propertyIds && input.propertyIds.length > 0) {
    propertyCodes = input.propertyIds;
  } else {
    // Query active, non-demo properties from property_year_configuration
    const pycs = await prisma.propertyYearConfiguration.findMany({
      where: {
        companyId: input.companyId,
        organisationId: input.organisationId,
        isActive: true,
        isDemo: false,
      },
      select: {
        propertyCode: true,
      },
    });
    propertyCodes = pycs.map((p) => p.propertyCode).filter(Boolean) as string[];
  }

  if (propertyCodes.length === 0) {
    return { success: true, syncedCount: 0, errors: ["No properties resolved for sync."] };
  }

  // 3. Match source property codes to canonical database properties
  const propertyMaps = await prisma.sourceRecordMap.findMany({
    where: {
      companyId: input.companyId,
      organisationId: input.organisationId,
      integrationSourceId: input.integrationSourceId,
      entityName: "Property",
      sourceRecordId: {
        in: propertyCodes,
      },
      matchStatus: {
        in: ["AUTO_MATCHED", "MANUAL_MATCHED"],
      },
    },
  });

  const propertyIdMap = new Map<string, string>();
  for (const m of propertyMaps) {
    if (m.sourceRecordId && m.canonicalRecordId) {
      propertyIdMap.set(m.sourceRecordId, m.canonicalRecordId);
    }
  }

  // Also match directly from properties table
  const directProperties = await prisma.property.findMany({
    where: {
      companyId: input.companyId,
      organisationId: input.organisationId,
      OR: [
        { code: { in: propertyCodes } },
        { externalId: { in: propertyCodes.map((c) => Number(c)).filter((n) => !Number.isNaN(n)) } },
      ],
    },
    select: {
      id: true,
      code: true,
      externalId: true,
    },
  });

  for (const dp of directProperties) {
    if (dp.code) propertyIdMap.set(dp.code, dp.id);
    if (dp.externalId) propertyIdMap.set(String(dp.externalId), dp.id);
  }

  // 4. Initialize Entrata Reports Connector
  const connector = new EntrataReportsConnector(
    { baseUrl, orgSlug },
    { apiKey }
  );

  // Convert property codes to numbers for the property_group_ids report filter
  const propertyGroupIds = propertyCodes.map((c) => Number(c)).filter((n) => !Number.isNaN(n));

  try {
    // 5. Call Entrata API
    const response = (await connector.fetchReportData({
      requestId: String(Date.now()),
      reportName: "property_closings",
      reportVersion: "1.2",
      filters: {
        property_group_ids: propertyGroupIds,
        display_locked_through_period: "1",
        display_auto_roll_days: "1",
      },
    })) as any;

    // 6. Parse response & upsert into property_closing_statuses
    const root = asObject(response);
    const responseObj = asObject(root.response);
    const resultObj = asObject(responseObj.result);
    const reportData = asArray(resultObj.reportData);

    for (const row of reportData) {
      const propertyName = getString(row.property);
      const sourceRecordId = getString(row.property_id);

      if (!propertyName) {
        continue;
      }

      let canonicalPropertyId = sourceRecordId ? propertyIdMap.get(sourceRecordId) : null;

      // If not in map, fallback to case-insensitive name match
      if (!canonicalPropertyId) {
        const foundByName = await prisma.property.findFirst({
          where: {
            companyId: input.companyId,
            organisationId: input.organisationId,
            OR: [
              { name: { equals: propertyName, mode: "insensitive" } },
              { marketingName: { equals: propertyName, mode: "insensitive" } },
            ],
          },
          select: { id: true },
        });

        if (foundByName) {
          canonicalPropertyId = foundByName.id;
          if (sourceRecordId) propertyIdMap.set(sourceRecordId, foundByName.id);
        }
      }

      // Ignore properties that are not in the properties table
      if (!canonicalPropertyId) {
        continue;
      }

      const existing = await prisma.propertyClosingStatus.findUnique({
        where: {
          companyId_organisationId_propertyName: {
            companyId: input.companyId,
            organisationId: input.organisationId,
            propertyName: propertyName,
          },
        },
        select: {
          glLockedThrough: true,
        },
      });

      const newGlLockedThrough = parseDate(row.gl_locked_through);
      const existingIso = existing?.glLockedThrough ? existing.glLockedThrough.toISOString().slice(0, 10) : null;
      const newIso = newGlLockedThrough ? newGlLockedThrough.toISOString().slice(0, 10) : null;
      const hasGlLockChanged = Boolean(
        existing &&
        existingIso !== newIso &&
        (existingIso !== null || newIso !== null)
      );

      // Upsert record
      await prisma.propertyClosingStatus.upsert({
        where: {
          companyId_organisationId_propertyName: {
            companyId: input.companyId,
            organisationId: input.organisationId,
            propertyName: propertyName,
          },
        },
        update: {
          propertyId: canonicalPropertyId,
          currentAr: parseDate(row.current_ar),
          arLockedThrough: parseDate(row.ar_locked_through),
          arAutoRollDay: getStringOrNull(row.ar_auto_roll_day),

          currentAp: parseDate(row.current_ap),
          apLockedThrough: parseDate(row.ap_locked_through),
          apAutoRollDay: getStringOrNull(row.ap_auto_roll_day),

          currentGl: parseDate(row.current_gl),
          glLockedThrough: newGlLockedThrough,
          glAutoRollDay: getStringOrNull(row.gl_auto_roll_day),

          ...(hasGlLockChanged
            ? {
                previousGlLockedThrough: existing?.glLockedThrough ?? null,
                isGlLockedChanged: true,
                glLockedChangedAt: new Date(),
              }
            : {}),

          sourceRecordId: sourceRecordId || null,
          lastSyncedAt: new Date(),
        },
        create: {
          companyId: input.companyId,
          organisationId: input.organisationId,
          propertyId: canonicalPropertyId,
          propertyName: propertyName,

          currentAr: parseDate(row.current_ar),
          arLockedThrough: parseDate(row.ar_locked_through),
          arAutoRollDay: getStringOrNull(row.ar_auto_roll_day),

          currentAp: parseDate(row.current_ap),
          apLockedThrough: parseDate(row.ap_locked_through),
          apAutoRollDay: getStringOrNull(row.ap_auto_roll_day),

          currentGl: parseDate(row.current_gl),
          glLockedThrough: newGlLockedThrough,
          glAutoRollDay: getStringOrNull(row.gl_auto_roll_day),

          previousGlLockedThrough: null,
          isGlLockedChanged: Boolean(newGlLockedThrough),
          glLockedChangedAt: newGlLockedThrough ? new Date() : null,

          sourceRecordId: sourceRecordId || null,
          lastSyncedAt: new Date(),
        },
      });

      syncedCount++;
    }
  } catch (err: any) {
    errors.push(err.message || String(err));
  }

  return {
    success: errors.length === 0,
    syncedCount,
    errors,
  };
}
