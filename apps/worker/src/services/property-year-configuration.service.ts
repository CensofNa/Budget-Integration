import { prisma } from "@budget-integration/database";

export type SyncablePropertyForYear = {
  propertyId: string;
  propertyCode: string;
  propertyName: string | null;
};

export type SkippedPropertyForYear = {
  propertyCode: string;
  reason:
    | "NOT_CONFIGURED_FOR_FISCAL_YEAR"
    | "INACTIVE_FOR_FISCAL_YEAR"
    | "DEMO_PROPERTY_EXCLUDED_FROM_ENTRATA_SYNC";
};

export type ResolveSyncablePropertiesResult = {
  properties: SyncablePropertyForYear[];
  skippedProperties: SkippedPropertyForYear[];
};

export async function resolveSyncablePropertiesForFiscalYear(params: {
  companyId: string;
  organisationId: string;
  fiscalYear: number;
  propertyCodes?: string[];
  includeDemo?: boolean;
}): Promise<ResolveSyncablePropertiesResult> {
  const requestedCodes = params.propertyCodes
    ?.map((code) => String(code).trim())
    .filter(Boolean);

  const candidateRows = await prisma.propertyYearConfiguration.findMany({
    where: {
      companyId: params.companyId,
      organisationId: params.organisationId,
      ...(requestedCodes && requestedCodes.length > 0
        ? {
            propertyCode: {
              in: requestedCodes,
            },
          }
        : {}),
    },
    select: {
      propertyId: true,
      propertyCode: true,
      propertyName: true,
      fiscalYear: true,
      isActive: true,
      isDemo: true,
    },
    orderBy: [
      { propertyCode: "asc" },
      { fiscalYear: "desc" }
    ],
  });

  const rowsByCode = new Map<string, typeof candidateRows>();
  for (const row of candidateRows) {
    const list = rowsByCode.get(row.propertyCode) ?? [];
    list.push(row);
    rowsByCode.set(row.propertyCode, list);
  }

  const skippedProperties: SkippedPropertyForYear[] = [];
  const properties: SyncablePropertyForYear[] = [];

  const selectBestRow = (code: string) => {
    const codeRows = rowsByCode.get(code);
    if (!codeRows || codeRows.length === 0) return null;

    const exactMatch = codeRows.find((r) => r.fiscalYear === params.fiscalYear);
    if (exactMatch) return exactMatch;

    const nextYearMatch = codeRows.find((r) => r.fiscalYear === params.fiscalYear + 1);
    if (nextYearMatch) return nextYearMatch;

    return codeRows[0];
  };

  const targetPropertyCodes = requestedCodes && requestedCodes.length > 0
    ? requestedCodes
    : Array.from(rowsByCode.keys());

  for (const code of targetPropertyCodes) {
    const bestRow = selectBestRow(code);

    if (!bestRow) {
      skippedProperties.push({
        propertyCode: code,
        reason: "NOT_CONFIGURED_FOR_FISCAL_YEAR",
      });
      continue;
    }

    if (!bestRow.isActive) {
      skippedProperties.push({
        propertyCode: bestRow.propertyCode,
        reason: "INACTIVE_FOR_FISCAL_YEAR",
      });
      continue;
    }

    if (bestRow.isDemo && !params.includeDemo) {
      skippedProperties.push({
        propertyCode: bestRow.propertyCode,
        reason: "DEMO_PROPERTY_EXCLUDED_FROM_ENTRATA_SYNC",
      });
      continue;
    }

    properties.push({
      propertyId: bestRow.propertyId,
      propertyCode: bestRow.propertyCode,
      propertyName: bestRow.propertyName,
    });
  }

  return {
    properties,
    skippedProperties,
  };
}