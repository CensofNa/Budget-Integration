import { Prisma, PrismaClient } from "@prisma/client";

import {
  asArray,
  asObject,
  getBoolean,
  getDecimal,
  getInt,
  getString,
  getStringOrNull,
  parseDate,
  // nullableInt,
  type JsonObject
} from "@budget-integration/integration-core";

export interface TransformEntrataUnitTypeInput {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
  stagingUnitTypeId: string;
  sourcePropertyId: string;
  sourceUnitTypeId: string;
  sourceHash?: string | null;
  rawUnitTypePayload: Prisma.JsonValue;
}

function getFloorplans(unitType: JsonObject): JsonObject[] {
  const floorplan = asObject(unitType.floorplan);

  return Object.keys(floorplan).map((key) => {
    const value = asObject(floorplan[key]);

    return {
      sourceFloorPlanId:
        getString(asObject(value["@attributes"]).Id) ?? key,
      floorPlanName: getString(value["@value"])
    };
  });
}

function getRentTerms(unitType: JsonObject): JsonObject[] {
  const rent = asObject(unitType.rent);
  const termRent = asObject(rent.termRent);

  if (Array.isArray(rent.termRent)) {
    return rent.termRent.map(asObject);
  }

  if (Object.keys(termRent).length > 0) {
    return [termRent];
  }

  return [];
}

export async function transformEntrataUnitType(
  prisma: PrismaClient,
  input: TransformEntrataUnitTypeInput
): Promise<void> {
  const unitType = asObject(input.rawUnitTypePayload);

  if (!input.sourcePropertyId) {
    throw new Error("UnitType sourcePropertyId is missing.");
  }

  if (!input.sourceUnitTypeId) {
    throw new Error("UnitType sourceUnitTypeId is missing.");
  }

  const propertyMap = await prisma.sourceRecordMap.findUnique({
    where: {
      companyId_organisationId_integrationSourceId_entityName_sourceRecordId: {
        companyId: input.companyId,
        organisationId: input.organisationId,
        integrationSourceId: input.integrationSourceId,
        entityName: "Property",
        sourceRecordId: input.sourcePropertyId
      }
    }
  });

  let property = propertyMap?.canonicalRecordId
    ? await prisma.property.findUnique({
        where: { id: propertyMap.canonicalRecordId }
      })
    : null;

  if (!property) {
    const numericSourcePropId = Number.parseInt(input.sourcePropertyId, 10);
    const validNumericPropId =
      Number.isInteger(numericSourcePropId) && numericSourcePropId > 0
        ? numericSourcePropId
        : null;

    property = await prisma.property.findFirst({
      where: {
        companyId: input.companyId,
        OR: [
          { code: input.sourcePropertyId },
          ...(validNumericPropId !== null ? [{ externalId: validNumericPropId }] : [])
        ]
      }
    });

    if (property && propertyMap) {
      await prisma.sourceRecordMap.update({
        where: { id: propertyMap.id },
        data: {
          canonicalRecordId: property.id,
          lastSyncedAt: new Date()
        }
      });
    }
  }

  if (!property) {
    throw new Error(
      `Cannot resolve Property for Entrata sourcePropertyId ${input.sourcePropertyId}.`
    );
  }

  const propertyId = property.id;
  const floorplans = getFloorplans(unitType);
  const rentTerms = getRentTerms(unitType);

  await prisma.$transaction(async (tx) => {
    const existingMap = await tx.sourceRecordMap.findUnique({
      where: {
        companyId_organisationId_integrationSourceId_entityName_sourceRecordId: {
          companyId: input.companyId,
          organisationId: input.organisationId,
          integrationSourceId: input.integrationSourceId,
          entityName: "UnitType",
          sourceRecordId: input.sourceUnitTypeId
        }
      }
    });

    let propertyUnitTypeId = existingMap?.canonicalRecordId;

    if (propertyUnitTypeId) {
      const existingRecord = await tx.propertyUnitType.findUnique({
        where: { id: propertyUnitTypeId }
      });
      if (!existingRecord) {
        propertyUnitTypeId = undefined;
      }
    }

    const unitTypeData = {
      unitTypeName: getStringOrNull(unitType.name),
      sourceUnitTypeId: input.sourceUnitTypeId,
      unitCount: getInt(unitType.unitCount),
      bedrooms: getInt(unitType.unitBedRooms),
      bathrooms: getInt(unitType.unitBathrooms),
      minSquareFeet: getInt(unitType.minSquareFeet),
      maxSquareFeet: getInt(unitType.maxSquareFeet),
      minMarketRent: getDecimal(unitType.minMarketRent),
      maxMarketRent: getDecimal(unitType.maxMarketRent),
      updatedSource: "ENTRATA",
      lastSyncedAt: new Date()
    };

    if (propertyUnitTypeId) {
      await tx.propertyUnitType.update({
        where: { id: propertyUnitTypeId },
        data: unitTypeData
      });
    } else {
      const created = await tx.propertyUnitType.upsert({
        where: {
          companyId_organisationId_propertyId_sourceUnitTypeId: {
            companyId: input.companyId,
            organisationId: input.organisationId,
            propertyId,
            sourceUnitTypeId: input.sourceUnitTypeId
          }
        },
        update: unitTypeData,
        create: {
          companyId: input.companyId,
          organisationId: input.organisationId,
          propertyId,
          ...unitTypeData,
          createdSource: "ENTRATA"
        }
      });

      propertyUnitTypeId = created.id;
    }

    await tx.propertyUnitTypeFloorplan.deleteMany({
      where: {
        propertyUnitTypeId
      }
    });

    for (const floorplan of floorplans) {
      await tx.propertyUnitTypeFloorplan.create({
        data: {
          companyId: input.companyId,
          organisationId: input.organisationId,
          propertyUnitTypeId,
          sourceFloorPlanId: getStringOrNull(floorplan.sourceFloorPlanId),
          floorPlanName: getStringOrNull(floorplan.floorPlanName)
        }
      });
    }

    await tx.propertyUnitTypeRentTerm.deleteMany({
      where: {
        propertyUnitTypeId
      }
    });

    for (const rentTerm of rentTerms) {
      const attrs = asObject(rentTerm["@attributes"]);

      await tx.propertyUnitTypeRentTerm.create({
        data: {
          companyId: input.companyId,
          organisationId: input.organisationId,
          propertyUnitTypeId,
          leaseTerm: getStringOrNull(attrs.leaseTerm),
          leaseTermId: getStringOrNull(attrs.leaseTermId),
          leaseTermName: getStringOrNull(attrs.leaseTermName),
          rent: getDecimal(attrs.rent),
          startDate: parseDate(attrs.startDate),
          endDate: parseDate(attrs.endtDate ?? attrs.endDate),
          spaceOptionId: getStringOrNull(attrs.spaceOptionId),
          spaceOption: getStringOrNull(attrs.spaceOption),
          isSoldOut: getBoolean(attrs.isSoldOut)
        }
      });
    }

    await tx.sourceRecordMap.upsert({
      where: {
        companyId_organisationId_integrationSourceId_entityName_sourceRecordId: {
          companyId: input.companyId,
          organisationId: input.organisationId,
          integrationSourceId: input.integrationSourceId,
          entityName: "UnitType",
          sourceRecordId: input.sourceUnitTypeId
        }
      },
      update: {
        canonicalTableName: "property_unit_types",
        canonicalRecordId: propertyUnitTypeId,
        matchStatus: "AUTO_MATCHED",
        confidenceScore: new Prisma.Decimal("100.00"),
        isAuthoritative: true,
        sourceHash: input.sourceHash ?? null,
        lastSyncedAt: new Date()
      },
      create: {
        companyId: input.companyId,
        organisationId: input.organisationId,
        integrationSourceId: input.integrationSourceId,
        entityName: "UnitType",
        sourceRecordId: input.sourceUnitTypeId,
        canonicalTableName: "property_unit_types",
        canonicalRecordId: propertyUnitTypeId,
        matchStatus: "AUTO_MATCHED",
        confidenceScore: new Prisma.Decimal("100.00"),
        isAuthoritative: true,
        sourceHash: input.sourceHash ?? null,
        lastSyncedAt: new Date()
      }
    });

    await tx.stagingUnitType.update({
      where: {
        id: input.stagingUnitTypeId
      },
      data: {
        validationStatus: "VALID",
        transformStatus: "TRANSFORMED",
        transformedAt: new Date()
      }
    });
  }, {
    timeout: 15000  // 15 seconds to account for remote database latency
  });
}