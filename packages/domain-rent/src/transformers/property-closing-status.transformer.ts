import { PrismaClient } from "@prisma/client";
import {
  asObject,
  getString,
  getStringOrNull,
  parseDate
} from "@budget-integration/integration-core";

export async function transformPropertyClosingStatus(
  prisma: PrismaClient,
  input: {
    stagingReportDataId: string;
    companyId: string;
    organisationId: string;
    sourceRecordId: string;
    sourceHash?: string | null;
    rawRecordPayload: unknown;
  }
): Promise<void> {
  const row = asObject(input.rawRecordPayload);

  const propertyName = getString(row.property);

  if (!propertyName) {
    throw new Error("Property closing report row is missing property.");
  }



  const extId = Number(input.sourceRecordId);
  const property = await prisma.property.findFirst({
    where: {
      companyId: input.companyId,
      organisationId: input.organisationId,
      OR: [
        ...(input.sourceRecordId ? [{ code: input.sourceRecordId }] : []),
        ...(!Number.isNaN(extId) ? [{ externalId: extId }] : []),
        { name: { equals: propertyName, mode: "insensitive" } },
        { marketingName: { equals: propertyName, mode: "insensitive" } }
      ]
    },
    select: {
      id: true
    }
  });

  if (!property?.id) {
    console.log(`[INFO] Skipping property closing status for "${propertyName}" (${input.sourceRecordId}): not found in properties table`);
    await prisma.stagingReportData.update({
      where: { id: input.stagingReportDataId },
      data: {
        validationStatus: "VALID",
        transformStatus: "SKIPPED",
        transformedAt: new Date()
      }
    });
    return;
  }

  const newGlLockedThrough = parseDate(row.gl_locked_through);

  const existing = await prisma.propertyClosingStatus.findUnique({
    where: {
      companyId_organisationId_propertyName: {
        companyId: input.companyId,
        organisationId: input.organisationId,
        propertyName: propertyName
      }
    },
    select: {
      glLockedThrough: true,
      isGlLockedChanged: true
    }
  });

  const existingIso = existing?.glLockedThrough ? existing.glLockedThrough.toISOString().slice(0, 10) : null;
  const newIso = newGlLockedThrough ? newGlLockedThrough.toISOString().slice(0, 10) : null;
  const hasGlLockChanged = Boolean(
    existing &&
    existingIso !== newIso &&
    (existingIso !== null || newIso !== null)
  );

  await prisma.propertyClosingStatus.upsert({
    where: {
      companyId_organisationId_propertyName: {
        companyId: input.companyId,
        organisationId: input.organisationId,
        propertyName: propertyName
      }
    },
    update: {
      propertyId: property.id,
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
            glLockedChangedAt: new Date()
          }
        : {}),

      sourceRecordId: input.sourceRecordId,
      sourceHash: input.sourceHash ?? null,
      lastSyncedAt: new Date()
    },
    create: {
      companyId: input.companyId,
      organisationId: input.organisationId,
      propertyId: property.id,
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

      sourceRecordId: input.sourceRecordId,
      sourceHash: input.sourceHash ?? null,
      lastSyncedAt: new Date()
    }
  });

  await prisma.stagingReportData.update({
    where: { id: input.stagingReportDataId },
    data: {
      validationStatus: "VALID",
      transformStatus: "TRANSFORMED",
      transformedAt: new Date()
    }
  });
}