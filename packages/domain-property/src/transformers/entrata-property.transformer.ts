import { Prisma, PrismaClient } from "@prisma/client";

import {
  asObject,
  getString,
  asArray,
  getStringOrNull,
  getInt,
  getBoolean,
  parseDate
} from "@budget-integration/integration-core";

type JsonObject = Record<string, unknown>;

export interface TransformEntrataPropertyInput {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
  stagingPropertyId: string;
  sourceRecordId: string;
  sourceHash?: string | null;
  rawPropertyPayload: Prisma.JsonValue;
  updateFiscalConfig?: boolean | undefined;
}

function parsePostMonth(value: unknown): { raw: string | null; year: number | null; monthNo: number | null } {
  const raw = getString(value);
  if (!raw) return { raw: null, year: null, monthNo: null };

  const parts = raw.split("/");
  if (parts.length !== 2) {
    return { raw, year: null, monthNo: null };
  }

  const monthNo = Number.parseInt(parts[0] ?? "", 10);
  const year = Number.parseInt(parts[1] ?? "", 10);

  return {
    raw,
    monthNo: Number.isNaN(monthNo) ? null : monthNo,
    year: Number.isNaN(year) ? null : year
  };
}

function nullableDate(value: unknown): Date | null {
  const raw = getString(value);
  if (!raw) return null;

  // Entrata often sends MM/DD/YYYY. Native Date parses this reliably enough in Node for this format.
  // If other formats appear, replace this with a stricter date parser.
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    const text = getString(value);
    if (text) return text;
  }

  return null;
}

import { resolveSystemAdminUserId } from "@budget-integration/integration-core";
export { resolveSystemAdminUserId };

export async function transformEntrataProperty(
  prisma: PrismaClient,
  input: TransformEntrataPropertyInput
): Promise<void> {
  const payload = asObject(input.rawPropertyPayload);

  const sourceRecordId =
    input.sourceRecordId ||
    getString(payload.PropertyID) ||
    getString(payload.Id);

  if (!sourceRecordId) {
    throw new Error("Entrata property sourceRecordId / PropertyID is missing.");
  }

  const code =
    getFirstString(payload.PropertyCode, payload.PropertyID) ?? sourceRecordId;

  const propertyName =
    getFirstString(payload.MarketingName, payload.Name, code) ?? code;

  const postMonths = asObject(payload.PostMonths);
  const arPost = parsePostMonth(postMonths.ArPostMonth);
  const apPost = parsePostMonth(postMonths.ApPostMonth);
  const glPost = parsePostMonth(postMonths.GlPostMonth);

  await prisma.$transaction(async (tx) => {
    const systemAdminUserId = await resolveSystemAdminUserId(tx);

    const existingMap = await tx.sourceRecordMap.findUnique({
      where: {
        companyId_organisationId_integrationSourceId_entityName_sourceRecordId: {
          companyId: input.companyId,
          organisationId: input.organisationId,
          integrationSourceId: input.integrationSourceId,
          entityName: "Property",
          sourceRecordId
        }
      }
    });

    let propertyId = existingMap?.canonicalRecordId;

    const numericSourceId = Number.parseInt(sourceRecordId, 10);
    const validNumericSourceId =
      Number.isInteger(numericSourceId) && numericSourceId > 0
        ? numericSourceId
        : null;

    let propertyRecord: {
      id: string;
      code: string | null;
      name: string | null;
      type: string | null;
      yearBuilt: number | null;
      shortDescription: string | null;
      longDescription: string | null;
      website: string | null;
      isDisabled: boolean;
      isFeatured: boolean;
      externalId: number | null;
      budgetYear: number | null;
      budgetYearType: "CALENDAR_YEAR" | "FISCAL_YEAR" | null;
      fiscalYearStartMonth: number | null;
      fiscalYearEndMonth: number | null;
      fiscalYearStartDate: Date | null;
      fiscalYearEndDate: Date | null;
      updatedBy: string | null;
    } | null = null;

    const propertySelect = {
      id: true,
      code: true,
      name: true,
      type: true,
      yearBuilt: true,
      shortDescription: true,
      longDescription: true,
      website: true,
      isDisabled: true,
      isFeatured: true,
      externalId: true,
      budgetYear: true,
      budgetYearType: true,
      fiscalYearStartMonth: true,
      fiscalYearEndMonth: true,
      fiscalYearStartDate: true,
      fiscalYearEndDate: true,
      updatedBy: true
    } as const;

    if (propertyId) {
      propertyRecord = await tx.property.findUnique({
        where: { id: propertyId },
        select: propertySelect
      });
      if (!propertyRecord) {
        propertyId = undefined;
      }
    }

    if (!propertyRecord) {
      const orConditions: Prisma.PropertyWhereInput[] = [
        { code: code },
        { code: sourceRecordId }
      ];
      if (validNumericSourceId !== null) {
        orConditions.push({ externalId: validNumericSourceId });
      }
      const rawPropCode = getString(payload.PropertyCode);
      if (rawPropCode && rawPropCode !== code && rawPropCode !== sourceRecordId) {
        orConditions.push({ code: rawPropCode });
      }

      propertyRecord = await tx.property.findFirst({
        where: {
          companyId: input.companyId,
          OR: orConditions
        },
        select: propertySelect
      });

      if (propertyRecord) {
        propertyId = propertyRecord.id;
      }
    }

    // Resolve fiscal dates from payload (if populated via getBudgets during getProperties sync)
    // or fallback to existing property_budgets row for this property
    let resolvedFiscalStartDate = parseDate(payload.FiscalStartDate ?? payload.fiscalStartDate);
    let resolvedFiscalEndDate = parseDate(payload.FiscalEndDate ?? payload.fiscalEndDate);
    let resolvedFiscalYear = getInt(payload.FiscalYear ?? payload.fiscalYear);

    if ((!resolvedFiscalStartDate || !resolvedFiscalEndDate) && propertyId) {
      const existingBudget = await tx.propertyBudget.findFirst({
        where: {
          companyId: input.companyId,
          organisationId: input.organisationId,
          propertyId,
          fiscalStartDate: { not: null },
          fiscalEndDate: { not: null }
        },
        orderBy: [{ isDefault: "desc" }, { fiscalYear: "desc" }, { updatedAt: "desc" }],
        select: {
          fiscalYear: true,
          fiscalStartDate: true,
          fiscalEndDate: true
        }
      });

      if (existingBudget?.fiscalStartDate && existingBudget?.fiscalEndDate) {
        resolvedFiscalStartDate = existingBudget.fiscalStartDate;
        resolvedFiscalEndDate = existingBudget.fiscalEndDate;
        resolvedFiscalYear = resolvedFiscalYear ?? existingBudget.fiscalYear;
      }
    }

    const resolvedStartMonth = resolvedFiscalStartDate ? resolvedFiscalStartDate.getUTCMonth() + 1 : null;
    const resolvedEndMonth = resolvedFiscalEndDate ? resolvedFiscalEndDate.getUTCMonth() + 1 : null;
    const resolvedBudgetYearType: "CALENDAR_YEAR" | "FISCAL_YEAR" | null =
      resolvedStartMonth !== null
        ? resolvedStartMonth === 1
          ? "CALENDAR_YEAR"
          : "FISCAL_YEAR"
        : null;

    // Target budget being created is for the upcoming budget year (e.g. 2027 when current year is 2026)
    const defaultPlanningBudgetYear = new Date().getUTCFullYear() + 1;
    const defaultCalStartDate = new Date(Date.UTC(defaultPlanningBudgetYear, 0, 1));
    const defaultCalEndDate = new Date(Date.UTC(defaultPlanningBudgetYear, 11, 31));

    const marketingName = getString(payload.MarketingName) || propertyRecord?.name || "";
    const propType = getStringOrNull(payload.Type) ?? propertyRecord?.type ?? null;
    const yearBuilt = getInt(payload.YearBuilt) ?? propertyRecord?.yearBuilt ?? null;
    const shortDesc = getStringOrNull(payload.ShortDescription) ?? propertyRecord?.shortDescription ?? null;
    const longDesc = getStringOrNull(payload.LongDescription) ?? propertyRecord?.longDescription ?? null;
    const website = getFirstString(payload.webSite, payload.Website) ?? propertyRecord?.website ?? null;
    const isDisabled = getBoolean(payload.IsDisabled);
    const isFeatured = getBoolean(payload.IsFeaturedProperty);
    const targetExternalId = validNumericSourceId ?? propertyRecord?.externalId ?? null;

    if (propertyId && propertyRecord) {
      const targetBudgetYear = input.updateFiscalConfig ? defaultPlanningBudgetYear : (propertyRecord.budgetYear ?? defaultPlanningBudgetYear);
      const targetBudgetYearType = input.updateFiscalConfig ? (resolvedBudgetYearType ?? propertyRecord.budgetYearType ?? "CALENDAR_YEAR") : (propertyRecord.budgetYearType ?? "CALENDAR_YEAR");
      const targetStartMonth = input.updateFiscalConfig ? (resolvedStartMonth ?? propertyRecord.fiscalYearStartMonth ?? 1) : (propertyRecord.fiscalYearStartMonth ?? 1);
      const targetEndMonth = input.updateFiscalConfig ? (resolvedEndMonth ?? propertyRecord.fiscalYearEndMonth ?? 12) : (propertyRecord.fiscalYearEndMonth ?? 12);
      const targetStartDate = new Date(Date.UTC(targetBudgetYear, targetStartMonth - 1, 1));
      const targetEndDate = new Date(
        Date.UTC(targetEndMonth < targetStartMonth ? targetBudgetYear + 1 : targetBudgetYear, targetEndMonth, 0)
      );

      const isUnchanged =
        (propertyRecord.name ?? "") === marketingName &&
        (propertyRecord.type ?? null) === propType &&
        (propertyRecord.yearBuilt ?? null) === yearBuilt &&
        (propertyRecord.shortDescription ?? null) === shortDesc &&
        (propertyRecord.longDescription ?? null) === longDesc &&
        (propertyRecord.website ?? null) === website &&
        propertyRecord.isDisabled === isDisabled &&
        propertyRecord.isFeatured === isFeatured &&
        (propertyRecord.externalId ?? null) === targetExternalId &&
        (propertyRecord.budgetYear ?? null) === (targetBudgetYear ?? null) &&
        propertyRecord.budgetYearType === targetBudgetYearType &&
        (propertyRecord.fiscalYearStartMonth ?? null) === (targetStartMonth ?? null) &&
        (propertyRecord.fiscalYearEndMonth ?? null) === (targetEndMonth ?? null) &&
        (propertyRecord.fiscalYearStartDate?.toISOString().slice(0, 10) ?? null) ===
          (targetStartDate?.toISOString().slice(0, 10) ?? null) &&
        (propertyRecord.fiscalYearEndDate?.toISOString().slice(0, 10) ?? null) ===
          (targetEndDate?.toISOString().slice(0, 10) ?? null);

      if (!isUnchanged) {
        const propertyUpdateData: Prisma.PropertyUpdateInput = {
          // Preserve immutable code if already set on propertyRecord
          code: propertyRecord.code || code,
          name: marketingName,
          type: propType,
          yearBuilt: yearBuilt,
          shortDescription: shortDesc,
          longDescription: longDesc,
          website: website,
          isDisabled: isDisabled,
          isFeatured: isFeatured,
          budgetYear: targetBudgetYear,
          budgetYearType: targetBudgetYearType,
          fiscalYearStartMonth: targetStartMonth,
          fiscalYearEndMonth: targetEndMonth,
          fiscalYearStartDate: targetStartDate,
          fiscalYearEndDate: targetEndDate,
          updatedSource: "ENTRATA",
          ...(systemAdminUserId ? { updatedBy: systemAdminUserId } : {}),
          lastSyncedAt: new Date()
        };

        if (targetExternalId !== null && propertyRecord.externalId !== targetExternalId) {
          propertyUpdateData.externalId = targetExternalId;
        }

        await tx.property.update({
          where: { id: propertyId },
          data: propertyUpdateData
        });
      } else {
        await tx.property.update({
          where: { id: propertyId },
          data: {
            updatedSource: "ENTRATA",
            ...(systemAdminUserId ? { updatedBy: systemAdminUserId } : {}),
            lastSyncedAt: new Date()
          }
        });
      }
    } else {
      const defaultWorkflow = await tx.workflowDefinition.findFirst({
        where: {
          companyId: input.companyId,
          organisationId: input.organisationId,
          status: "ACTIVE",
          isDefault: true
        },
        select: {
          id: true
        }
      });

      const createStartMonth = resolvedStartMonth ?? 1;
      const createEndMonth = resolvedEndMonth ?? 12;
      const createStartDate =
        resolvedStartMonth !== null
          ? new Date(Date.UTC(defaultPlanningBudgetYear, createStartMonth - 1, 1))
          : defaultCalStartDate;
      const createEndDate =
        resolvedStartMonth !== null
          ? new Date(
              Date.UTC(
                createEndMonth < createStartMonth ? defaultPlanningBudgetYear + 1 : defaultPlanningBudgetYear,
                createEndMonth,
                0
              )
            )
          : defaultCalEndDate;

      const property = await tx.property.create({
        data: {
          companyId: input.companyId,
          organisationId: input.organisationId,
          code: code,
          externalId: validNumericSourceId,
          name: getFirstString(payload.MarketingName) || "",
          type: getStringOrNull(payload.Type),
          yearBuilt: getInt(payload.YearBuilt),
          shortDescription: getStringOrNull(payload.ShortDescription),
          longDescription: getStringOrNull(payload.LongDescription),
          website: getFirstString(payload.webSite, payload.Website),
          isDisabled: getBoolean(payload.IsDisabled),
          isFeatured: getBoolean(payload.IsFeaturedProperty),
          budgetYear: defaultPlanningBudgetYear,
          budgetYearType: resolvedBudgetYearType ?? "CALENDAR_YEAR",
          fiscalYearStartMonth: createStartMonth,
          fiscalYearEndMonth: createEndMonth,
          fiscalYearStartDate: createStartDate,
          fiscalYearEndDate: createEndDate,
          workflowDefinitionId: defaultWorkflow?.id || null,
          createdSource: "ENTRATA",
          updatedSource: "ENTRATA",
          ...(systemAdminUserId ? { createdBy: systemAdminUserId, updatedBy: systemAdminUserId } : {}),
          lastSyncedAt: new Date()
        }
      });

      propertyId = property.id;
    }

    await tx.propertyAddress.deleteMany({ where: { propertyId } });

    const primaryAddress = asObject(payload.Address);
    if (Object.keys(primaryAddress).length > 0) {
      await tx.propertyAddress.create({
        data: {
          companyId: input.companyId,
          organisationId: input.organisationId,
          propertyId,
          sourceAddressType: "PROPERTY_OBJECT",
          addressType: "PRIMARY",
          addressLine1: getStringOrNull(primaryAddress.Address),
          city: getStringOrNull(primaryAddress.City),
          state: getStringOrNull(primaryAddress.State),
          stateCode: getStringOrNull(primaryAddress.StateCode),
          province: getStringOrNull(primaryAddress.Province),
          postalCode: getStringOrNull(primaryAddress.PostalCode),
          country: getStringOrNull(primaryAddress.Country),
          email: getStringOrNull(primaryAddress.Email),
          isPrimary: true
        }
      });
    }

    const addressArrayRoot = asObject(payload.Addresses);
    const addressRows = asArray(addressArrayRoot.Address);

    for (const address of addressRows) {
      await tx.propertyAddress.create({
        data: {
          companyId: input.companyId,
          organisationId: input.organisationId,
          propertyId,
          sourceAddressType: "ADDRESS_ARRAY",
          addressType: getStringOrNull(address.AddressType),
          addressLine1: getStringOrNull(address.Address),
          city: getStringOrNull(address.City),
          state: getStringOrNull(address.State),
          stateCode: getStringOrNull(address.StateCode),
          province: getStringOrNull(address.Province),
          postalCode: getStringOrNull(address.PostalCode),
          country: getStringOrNull(address.Country),
          email: getStringOrNull(address.Email),
          isPrimary: false
        }
      });
    }

    await tx.propertyPostMonth.upsert({
      where: { propertyId },
      update: {
        companyId: input.companyId,
        organisationId: input.organisationId,
        arPostMonth: arPost.raw,
        arPostYear: arPost.year,
        arPostMonthNo: arPost.monthNo,
        apPostMonth: apPost.raw,
        apPostYear: apPost.year,
        apPostMonthNo: apPost.monthNo,
        glPostMonth: glPost.raw,
        glPostYear: glPost.year,
        glPostMonthNo: glPost.monthNo
      },
      create: {
        companyId: input.companyId,
        organisationId: input.organisationId,
        propertyId,
        arPostMonth: arPost.raw,
        arPostYear: arPost.year,
        arPostMonthNo: arPost.monthNo,
        apPostMonth: apPost.raw,
        apPostYear: apPost.year,
        apPostMonthNo: apPost.monthNo,
        glPostMonth: glPost.raw,
        glPostYear: glPost.year,
        glPostMonthNo: glPost.monthNo
      }
    });

    await tx.propertyOfficeHour.deleteMany({ where: { propertyId } });

    const propertyHours = asObject(payload.PropertyHours);
    const officeHours = asObject(propertyHours.OfficeHours);
    const officeHourRows = asArray(officeHours.OfficeHour);

    for (const officeHour of officeHourRows) {
      await tx.propertyOfficeHour.create({
        data: {
          companyId: input.companyId,
          organisationId: input.organisationId,
          propertyId,
          day: getStringOrNull(officeHour.Day) || "",
          availability: getStringOrNull(officeHour.AvailabilityType) || "",
          availabilityType: getStringOrNull(officeHour.AvailabilityType),
          openTime: getStringOrNull(officeHour.OpenTime),
          closeTime: getStringOrNull(officeHour.CloseTime),
          lunchStartTime: getStringOrNull(officeHour.LunchStartTime),
          lunchEndTime: getStringOrNull(officeHour.LunchEndTime)
        }
      });
    }

    const spaceOptionsRoot = asObject(payload.SpaceOptions);
    const spaceOptionRows = asArray(spaceOptionsRoot.SpaceOption);

    await tx.propertySpaceOption.deleteMany({ where: { propertyId } });

    for (const option of spaceOptionRows) {
      const optionCode = getFirstString(option.SpaceOptionID, option.Id, option.OptionID);
      if (!optionCode) continue;

      const spaceOption = await tx.spaceOption.upsert({
        where: {
          companyId_organisationId_optionCode: {
            companyId: input.companyId,
            organisationId: input.organisationId,
            optionCode
          }
        },
        update: {
          name: getStringOrNull(option.Name),
          updatedSource: "ENTRATA",
          lastSyncedAt: new Date()
        },
        create: {
          companyId: input.companyId,
          organisationId: input.organisationId,
          optionCode,
          name: getStringOrNull(option.Name),
          createdSource: "ENTRATA",
          updatedSource: "ENTRATA",
          lastSyncedAt: new Date()
        }
      });

      await tx.propertySpaceOption.upsert({
        where: {
          propertyId_spaceOptionId: {
            propertyId,
            spaceOptionId: spaceOption.id
          }
        },
        update: {},
        create: {
          companyId: input.companyId,
          organisationId: input.organisationId,
          propertyId,
          spaceOptionId: spaceOption.id,
          name: spaceOption.name || "",
          externalId: spaceOption.id
        }
      });
    }

    await tx.propertyLeaseTerm.deleteMany({ where: { propertyId } });

    const leaseTermsRoot = asObject(payload.LeaseTerms);
    const leaseTermRows = asArray(leaseTermsRoot.LeaseTerm);

    for (const leaseTerm of leaseTermRows) {
      const externalLeaseTermId = getFirstString(
        leaseTerm.LeaseTermID,
        leaseTerm.Id,
        leaseTerm.TermID
      );

      const createdLeaseTerm =
        await tx.propertyLeaseTerm.create({
          data: {
            // companyId: input.companyId,
            // organisationId: input.organisationId,
            propertyId: propertyId,

            externalId: Number(leaseTerm.Id) || 0,
            // externalId: String(leaseTerm.TermID),

            name: getStringOrNull(leaseTerm.Name) || "",
            termMonths: getInt(leaseTerm.TermMonths),
            isProspect: getBoolean(leaseTerm.IsProspect),
            isRenewal: getBoolean(leaseTerm.IsRenewal),
            isActive: true,

            // createdSource: "ENTRATA",
            // updatedSource: "ENTRATA",

            // lastSyncedAt: new Date()
          }
        });

      const windowsRoot = asObject(leaseTerm.LeaseStartWindows);
      const windowRows = asArray(windowsRoot.LeaseStartWindow);

      for (const windowRow of windowRows) {
        await tx.leaseStartWindow.create({
          data: {
            companyId: input.companyId,
            organisationId: input.organisationId,
            propertyLeaseTermId: createdLeaseTerm.id,
            externalLeaseStartWindowId: getFirstString(windowRow.LeaseStartWindowID, windowRow.Id),
            windowStartDate: nullableDate(windowRow.WindowStartDate),
            windowEndDate: nullableDate(windowRow.WindowEndDate)
          }
        });
      }
    }

    await tx.sourceRecordMap.upsert({
      where: {
        companyId_organisationId_integrationSourceId_entityName_sourceRecordId: {
          companyId: input.companyId,
          organisationId: input.organisationId,
          integrationSourceId: input.integrationSourceId,
          entityName: "Property",
          sourceRecordId
        }
      },
      update: {
        canonicalTableName: "properties",
        canonicalRecordId: propertyId,
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
        entityName: "Property",
        sourceRecordId,
        canonicalTableName: "properties",
        canonicalRecordId: propertyId,
        matchStatus: "AUTO_MATCHED",
        confidenceScore: new Prisma.Decimal("100.00"),
        isAuthoritative: true,
        sourceHash: input.sourceHash ?? null,
        lastSyncedAt: new Date()
      }
    });

    await tx.stagingProperty.update({
      where: { id: input.stagingPropertyId },
      data: {
        validationStatus: "VALID",
        transformStatus: "TRANSFORMED",
        transformedAt: new Date()
      }
    });
  }, {
    timeout: 20000  // 20 seconds to account for remote database latency
  });
}
