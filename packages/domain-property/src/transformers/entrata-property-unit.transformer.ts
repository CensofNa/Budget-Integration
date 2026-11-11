import { Prisma, PrismaClient } from "@prisma/client";

import {
  asObject,
  getString
} from "@budget-integration/integration-core";

import { IntegrationError } from "@budget-integration/integration-core";

export interface TransformEntrataPropertyUnitInput {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
  stagingPropertyUnitId: string;
  sourcePropertyId: string;
  sourceUnitId: string | null;
  remotePrimaryKey: string | null;
  sourceHash?: string | null;
  rawUnitPayload: unknown;
}

function getInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(String(value).replace(/,/g, "").trim());

  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function getBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const text = String(value).trim().toLowerCase();

  if (text === "1" || text === "true" || text === "yes") return true;
  if (text === "0" || text === "false" || text === "no") return false;

  return null;
}

function extractUnitData(
  payload: Record<string, unknown>,
  sourceUnitId: string | null,
  remotePrimaryKey: string | null,
  now: Date
) {
  const unitNumber = getString(payload.unitNumber);
  const buildingId = getString(payload.buildingId);

  return {
    unitNumber: unitNumber ?? null,
    sourceUnitId: sourceUnitId ?? null,
    remotePrimaryKey: remotePrimaryKey ?? null,
    unitTypeId: getString(payload.unitTypeId) ?? null,
    unitTypeName: getString(payload.unitTypeName) ?? null,
    floorPlanId: getString(payload.floorPlanId) ?? null,
    floorplanName: getString(payload.floorplanName) ?? null,
    buildingId: buildingId ?? null,
    buildingName: getString(payload.buildingName) ?? null,
    floorId: getString(payload.floorId) ?? null,
    floorNumber: getString(payload.floorNumber) ?? null,
    bedrooms: getInt(payload.numberOfBedrooms),
    bathrooms: getInt(payload.numberOfBathrooms),
    squareFeet: getInt(payload.SquareFeet),
    maxOccupants: getInt(payload.maxNumberOccupants),
    maxPets: getInt(payload.maxNumberOfPets),
    isCorporateRented: getBoolean(payload.isCorporateRented),
    isFurnished: getBoolean(payload.isFurnished),
    updatedSource: "ENTRATA",
    lastSyncedAt: now
  };
}

export async function transformEntrataPropertyUnitsBatch(
  prisma: PrismaClient,
  inputs: TransformEntrataPropertyUnitInput[]
): Promise<{
  transformed: number;
  failed: number;
  failures: Array<{ stagingPropertyUnitId: string; error: unknown }>;
}> {
  if (inputs.length === 0) {
    return { transformed: 0, failed: 0, failures: [] };
  }

  const now = new Date();
  const failures: Array<{ stagingPropertyUnitId: string; error: unknown }> = [];

  // Group inputs by tenant + sourcePropertyId so we resolve Property & Snapshot ONCE per property
  const groups = new Map<string, TransformEntrataPropertyUnitInput[]>();
  for (const item of inputs) {
    const key = `${item.companyId}::${item.organisationId}::${item.integrationSourceId}::${item.sourcePropertyId}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  let transformedCount = 0;

  for (const [, groupItems] of groups) {
    const first = groupItems[0]!;
    const { companyId, organisationId, integrationSourceId, sourcePropertyId } = first;

    // 1. Resolve canonical Property ONCE for this property group
    const propertyMap = await prisma.sourceRecordMap.findFirst({
      where: {
        companyId,
        organisationId,
        integrationSourceId,
        entityName: "Property",
        canonicalTableName: "properties",
        sourceRecordId: sourcePropertyId,
        matchStatus: { in: ["AUTO_MATCHED", "MANUAL_MATCHED"] }
      },
      select: { canonicalRecordId: true }
    });

    let propertyId = propertyMap?.canonicalRecordId ?? null;

    if (!propertyId) {
      const numericSourcePropId = Number.parseInt(sourcePropertyId, 10);
      const validNumericPropId =
        Number.isInteger(numericSourcePropId) && numericSourcePropId > 0
          ? numericSourcePropId
          : null;

      const matchedProp = await prisma.property.findFirst({
        where: {
          companyId,
          organisationId,
          OR: [
            { code: sourcePropertyId },
            ...(validNumericPropId !== null ? [{ externalId: validNumericPropId }] : [])
          ]
        },
        select: { id: true }
      });

      propertyId = matchedProp?.id ?? null;
    }

    if (!propertyId) {
      const err = new IntegrationError({
        message: `Mapped property not found for sourcePropertyId: ${sourcePropertyId}`,
        code: "PROPERTY_UNIT_PROPERTY_MAPPING_NOT_FOUND",
        category: "VALIDATION_ERROR",
        retryable: false,
        severity: "ERROR",
        context: { companyId, organisationId, integrationSourceId, entityName: "PropertyUnit" }
      });
      for (const item of groupItems) {
        failures.push({ stagingPropertyUnitId: item.stagingPropertyUnitId, error: err });
      }
      continue;
    }

    // 2. Resolve/Upsert PropertyExternalSnapshot ONCE for this property group
    let snapshot = await prisma.propertyExternalSnapshot.findFirst({
      where: { propertyId, provider: "ENTRATA" },
      select: { id: true }
    });

    if (snapshot) {
      await prisma.propertyExternalSnapshot.update({
        where: { id: snapshot.id },
        data: {
          externalPropertyId: BigInt(sourcePropertyId),
          lastSyncedAt: now,
          updatedAt: now
        }
      });
    } else {
      snapshot = await prisma.propertyExternalSnapshot.create({
        data: {
          propertyId,
          provider: "ENTRATA",
          externalPropertyId: BigInt(sourcePropertyId),
          rawPayload: first.rawUnitPayload as Prisma.InputJsonValue,
          lastSyncedAt: now
        },
        select: { id: true }
      });
    }

    // 3. Pre-fetch all existing PropertyUnits for this property in ONE query
    const existingUnits = await prisma.propertyUnit.findMany({
      where: {
        companyId,
        organisationId,
        propertyId
      },
      select: {
        id: true,
        sourceUnitId: true,
        remotePrimaryKey: true,
        unitNumber: true,
        buildingId: true
      }
    });

    const bySourceUnitId = new Map<string, string>();
    const byRemotePrimaryKey = new Map<string, string>();
    const byUnitAndBuilding = new Map<string, string>();

    for (const u of existingUnits) {
      if (u.sourceUnitId) bySourceUnitId.set(u.sourceUnitId, u.id);
      if (u.remotePrimaryKey) byRemotePrimaryKey.set(u.remotePrimaryKey, u.id);
      if (u.unitNumber) {
        byUnitAndBuilding.set(`${u.unitNumber}::${u.buildingId ?? ""}`, u.id);
      }
    }

    // 4. Separate into units to create vs units to update
    interface PreparedUnitItem {
      input: TransformEntrataPropertyUnitInput;
      sourceRecordId: string;
      existingUnitId: string | undefined;
      unitData: ReturnType<typeof extractUnitData>;
    }

    const validItems: PreparedUnitItem[] = [];

    for (const item of groupItems) {
      const sourceRecordId = item.sourceUnitId || item.remotePrimaryKey;
      if (!sourceRecordId) {
        failures.push({
          stagingPropertyUnitId: item.stagingPropertyUnitId,
          error: new Error("PropertyUnit source record id is missing.")
        });
        continue;
      }

      const payload = asObject(item.rawUnitPayload);
      const unitData = extractUnitData(payload, item.sourceUnitId || null, item.remotePrimaryKey || null, now);

      const existingUnitId =
        (unitData.sourceUnitId ? bySourceUnitId.get(unitData.sourceUnitId) : undefined) ??
        (unitData.remotePrimaryKey ? byRemotePrimaryKey.get(unitData.remotePrimaryKey) : undefined) ??
        (unitData.unitNumber
          ? byUnitAndBuilding.get(`${unitData.unitNumber}::${unitData.buildingId ?? ""}`)
          : undefined);

      validItems.push({
        input: item,
        sourceRecordId,
        existingUnitId,
        unitData
      });
    }

    const toCreate = validItems.filter((v) => !v.existingUnitId);
    const toUpdate = validItems.filter((v) => !!v.existingUnitId);

    const resolvedCanonicalIdByStagingId = new Map<string, { canonicalId: string; item: PreparedUnitItem }>();

    // 5a. Bulk create new units using createManyAndReturn (1 query for all new units!)
    if (toCreate.length > 0) {
      try {
        const createdUnits = await prisma.propertyUnit.createManyAndReturn({
          data: toCreate.map((v) => ({
            companyId,
            organisationId,
            propertyId,
            snapshotId: snapshot.id,
            ...v.unitData,
            unitNumber: v.unitData.unitNumber ?? v.sourceRecordId,
            createdSource: "ENTRATA"
          })),
          select: {
            id: true,
            sourceUnitId: true,
            remotePrimaryKey: true,
            unitNumber: true,
            buildingId: true
          }
        });

        for (let i = 0; i < toCreate.length; i++) {
          const item = toCreate[i]!;
          const created = createdUnits[i];
          if (created) {
            resolvedCanonicalIdByStagingId.set(item.input.stagingPropertyUnitId, {
              canonicalId: created.id,
              item
            });
          }
        }
      } catch {
        // Fallback if any row in createMany has a conflict: process toCreate items in parallel chunks
        const CONCURRENCY = 20;
        for (let i = 0; i < toCreate.length; i += CONCURRENCY) {
          const chunk = toCreate.slice(i, i + CONCURRENCY);
          await Promise.all(
            chunk.map(async (v) => {
              try {
                const created = await prisma.propertyUnit.create({
                  data: {
                    companyId,
                    organisationId,
                    propertyId,
                    snapshotId: snapshot.id,
                    ...v.unitData,
                    unitNumber: v.unitData.unitNumber ?? v.sourceRecordId,
                    createdSource: "ENTRATA"
                  },
                  select: { id: true }
                });
                resolvedCanonicalIdByStagingId.set(v.input.stagingPropertyUnitId, {
                  canonicalId: created.id,
                  item: v
                });
              } catch (err) {
                failures.push({ stagingPropertyUnitId: v.input.stagingPropertyUnitId, error: err });
              }
            })
          );
        }
      }
    }

    // 5b. Update existing units in parallel chunks of 25
    if (toUpdate.length > 0) {
      const CONCURRENCY = 25;
      for (let i = 0; i < toUpdate.length; i += CONCURRENCY) {
        const chunk = toUpdate.slice(i, i + CONCURRENCY);
        await Promise.all(
          chunk.map(async (v) => {
            try {
              await prisma.propertyUnit.update({
                where: { id: v.existingUnitId! },
                data: {
                  ...v.unitData,
                  snapshotId: snapshot.id
                },
                select: { id: true }
              });
              resolvedCanonicalIdByStagingId.set(v.input.stagingPropertyUnitId, {
                canonicalId: v.existingUnitId!,
                item: v
              });
            } catch (err) {
              failures.push({ stagingPropertyUnitId: v.input.stagingPropertyUnitId, error: err });
            }
          })
        );
      }
    }

    // 6. Batch upsert SourceRecordMap (including sourceHash so unchanged units are SKIPPED next time!)
    const succeededEntries = Array.from(resolvedCanonicalIdByStagingId.values());
    if (succeededEntries.length > 0) {
      const MAP_CONCURRENCY = 25;
      for (let i = 0; i < succeededEntries.length; i += MAP_CONCURRENCY) {
        const chunk = succeededEntries.slice(i, i + MAP_CONCURRENCY);
        await Promise.all(
          chunk.map(({ canonicalId, item }) =>
            prisma.sourceRecordMap.upsert({
              where: {
                companyId_organisationId_integrationSourceId_entityName_sourceRecordId: {
                  companyId,
                  organisationId,
                  integrationSourceId,
                  entityName: "PropertyUnit",
                  sourceRecordId: item.sourceRecordId
                }
              },
              update: {
                canonicalTableName: "property_units",
                canonicalRecordId: canonicalId,
                sourceHash: item.input.sourceHash ?? null,
                matchStatus: "AUTO_MATCHED",
                lastSyncedAt: now
              },
              create: {
                companyId,
                organisationId,
                integrationSourceId,
                entityName: "PropertyUnit",
                sourceRecordId: item.sourceRecordId,
                canonicalTableName: "property_units",
                canonicalRecordId: canonicalId,
                sourceHash: item.input.sourceHash ?? null,
                matchStatus: "AUTO_MATCHED",
                lastSyncedAt: now
              }
            })
          )
        );
      }

      // 7. Mark all succeeded staging records as TRANSFORMED in ONE query!
      await prisma.stagingPropertyUnit.updateMany({
        where: {
          id: { in: succeededEntries.map((e) => e.item.input.stagingPropertyUnitId) }
        },
        data: {
          validationStatus: "VALID",
          transformStatus: "TRANSFORMED",
          transformedAt: now,
          validationErrors: Prisma.JsonNull,
          transformErrors: Prisma.JsonNull
        }
      });

      transformedCount += succeededEntries.length;
    }
  }

  return {
    transformed: transformedCount,
    failed: failures.length,
    failures
  };
}

export async function transformEntrataPropertyUnit(
  prisma: PrismaClient,
  input: TransformEntrataPropertyUnitInput
): Promise<void> {
  const result = await transformEntrataPropertyUnitsBatch(prisma, [input]);
  if (result.failures.length > 0) {
    throw result.failures[0]!.error;
  }
}