import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";
import { IntegrationError, createSourceHash, asObject, asArray, getString, getNumberFromJson, getStringArray, chunkArray, } from "@budget-integration/integration-core";
import { EntrataReportsConnector } from "@budget-integration/connector-entrata";
function normalizeReportCode(reportCode) {
    return reportCode.trim().toLowerCase();
}
function isOccupancyReport(reportCode) {
    const normalizedReportCode = normalizeReportCode(reportCode);
    return (normalizedReportCode === "box_score" ||
        normalizedReportCode === "resident_retention");
}
function isBoxReport(reportCode) {
    const normalizedReportCode = normalizeReportCode(reportCode);
    return (normalizedReportCode === "box_score" ||
        normalizedReportCode.startsWith("box_"));
}
function removeFuturePeriodFields(period) {
    const cleaned = { ...period };
    delete cleaned.allow_future_periods;
    delete cleaned.future_periods;
    delete cleaned.trailing_periods;
    return cleaned;
}
function removeFutureFields(filters) {
    const cleaned = { ...filters };
    delete cleaned.allow_future_periods;
    delete cleaned.future_periods;
    delete cleaned.trailing_periods;
    return cleaned;
}
function toEntrataPropertyGroupId(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
}
function getBoxScoreSummarizeByValues(input) {
    /*
     * Default Box Score behavior:
     *   1. property_name - exact property/month total as Entrata reports it
     *   2. unit_type     - detail rows for unit-type analytics
     *
     * A manual run can override this with input.filters.summarize_by, for example:
     *   { summarize_by: "unit_type" }
     */
    const explicitValue = input.inputFilters?.summarize_by ?? input.syncSettings.boxScoreSummarizeBy;
    const values = Array.isArray(explicitValue)
        ? explicitValue
        : typeof explicitValue === "string" && explicitValue.trim().length > 0
            ? explicitValue.split(",")
            : ["property_name", "unit_type"];
    const normalized = values
        .map((value) => getString(value)?.trim())
        .filter((value) => !!value && value.length > 0);
    return Array.from(new Set(normalized.length > 0 ? normalized : ["property_name", "unit_type"]));
}
function getPropertyNameFromReportRow(row) {
    return (getString(row.property) ??
        getString(row.property_name) ??
        getString(row.lookup_code) ??
        "Unknown");
}
function groupBoxScoreReportDataByProperty(reportData) {
    /*
     * Box Score can be requested for multiple property_group_ids in one call.
     * Entrata returns one reportData object with arrays containing rows for all requested properties.
     * Stage one payload per property so the transformer can upsert by property/month safely.
     */
    const sectionNames = [
        "availability",
        "property_pulse",
        "lead_activity",
        "lead_conversions",
        "make_ready",
    ];
    const grouped = new Map();
    for (const sectionName of sectionNames) {
        for (const row of asArray(reportData[sectionName])) {
            const propertyName = getPropertyNameFromReportRow(row);
            const existing = grouped.get(propertyName) ?? {};
            const rows = asArray(existing[sectionName]);
            rows.push(row);
            existing[sectionName] = rows;
            grouped.set(propertyName, existing);
        }
    }
    return Array.from(grouped.values());
}
function getTodayIsoDate() {
    return new Date().toISOString().slice(0, 10);
}
function clampFuturePeriodForReport(input) {
    if (!isBoxReport(input.reportCode)) {
        return {
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
        };
    }
    const today = getTodayIsoDate();
    if (input.periodStart > today) {
        return null;
    }
    return {
        periodStart: input.periodStart,
        periodEnd: input.periodEnd > today ? today : input.periodEnd,
    };
}
function buildSourceRecordId(reportCode, row, sourceKeyFields, rowIndex, filters) {
    /*
     * For most reports, sourceKeyFields are available on the row.
     * Box Score is staged as the whole reportData object, so it does not have a top-level
     * property/month key. Include request filters to avoid duplicate sourceRecordId values
     * across property/month batches.
     */
    const keyValues = sourceKeyFields.map((field) => {
        const value = row[field];
        return getString(value) ?? "null";
    });
    const filterObject = filters ?? {};
    const period = asObject(filterObject.period);
    const propertyGroupIds = filterObject.property_group_ids;
    const propertyCodes = Array.isArray(propertyGroupIds)
        ? propertyGroupIds.map((item) => getString(item) ?? "null").join(",")
        : (getString(propertyGroupIds) ?? "null");
    const rowPropertyName = (() => {
        const availabilityRow = asArray(row.availability)[0];
        const pulseRow = asArray(row.property_pulse)[0];
        return (getString(asObject(availabilityRow).property) ??
            getString(asObject(availabilityRow).property_name) ??
            getString(asObject(pulseRow).property) ??
            getString(asObject(pulseRow).property_name) ??
            "null");
    })();
    const requestKeyValues = [
        propertyCodes.length > 32 ? createHash("md5").update(propertyCodes).digest("hex") : propertyCodes,
        rowPropertyName,
        getString(period["daterange-start"]) ?? "null",
        getString(period["daterange-end"]) ?? "null",
        getString(filterObject.summarize_by) ?? "null",
    ];
    return `${reportCode}:${keyValues.join("|")}:${requestKeyValues.join("|")}:${rowIndex}`;
}
function getReportRows(reportCode, response) {
    const responseObject = asObject(response);
    const responseWrapper = asObject(responseObject.response);
    const resultArray = asArray(responseWrapper.result);
    const firstResult = resultArray[0];
    if (!firstResult) {
        return [];
    }
    const reportData = asObject(firstResult).reportData;
    /*
     * Most Entrata reports return reportData as an array.
     * Box Score returns reportData as an object with sections:
     * availability, property_pulse, lead_activity, lead_conversions, make_ready.
     *
     * For Box Score we stage the whole reportData object as one row because the transformer
     * needs to combine the sections into one monthly occupancy source row.
     */
    if (reportCode === "box_score" &&
        reportData &&
        typeof reportData === "object" &&
        !Array.isArray(reportData)) {
        return groupBoxScoreReportDataByProperty(reportData);
    }
    return asArray(reportData);
}
function getReportFilters(defaultParamsJson) {
    const defaultParams = asObject(defaultParamsJson);
    if (defaultParams.filters &&
        typeof defaultParams.filters === "object" &&
        !Array.isArray(defaultParams.filters)) {
        return defaultParams.filters;
    }
    return defaultParams;
}
function getMonthRanges(input) {
    if (input.periodStart && input.periodEnd) {
        return [
            {
                periodStart: input.periodStart,
                periodEnd: input.periodEnd,
            },
        ];
    }
    if (!input.fiscalYear) {
        throw new IntegrationError({
            message: "fiscalYear is required for occupancy report sync unless periodStart and periodEnd are provided.",
            code: "REPORT_PERIOD_MISSING",
            category: "VALIDATION_ERROR",
            retryable: false,
            context: { ...input },
        });
    }
    const startMonth = input.fiscalYearStartMonth &&
        input.fiscalYearStartMonth >= 1 &&
        input.fiscalYearStartMonth <= 12
        ? input.fiscalYearStartMonth
        : 1;
    return Array.from({ length: 12 }, (_, i) => {
        const totalMonthIndex = startMonth - 1 + i;
        const yearOffset = Math.floor(totalMonthIndex / 12);
        const monthInYear = totalMonthIndex % 12;
        const year = input.fiscalYear + yearOffset;
        const start = new Date(Date.UTC(year, monthInYear, 1));
        const end = new Date(Date.UTC(year, monthInYear + 1, 0));
        return {
            periodStart: start.toISOString().slice(0, 10),
            periodEnd: end.toISOString().slice(0, 10),
        };
    });
}
function getMonthIndexFromIsoDate(value) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
        throw new IntegrationError({
            message: `Invalid report period date: ${value}`,
            code: "REPORT_PERIOD_INVALID",
            category: "VALIDATION_ERROR",
            retryable: false,
            context: { value },
        });
    }
    return date.getUTCMonth();
}
function getResidentRetentionFuturePeriodsToFiscalYearEnd(periodStart, fiscalStartMonth = 1) {
    const calMonth = getMonthIndexFromIsoDate(periodStart) + 1;
    const fStart = fiscalStartMonth >= 1 && fiscalStartMonth <= 12 ? fiscalStartMonth : 1;
    const fiscalOffset = ((calMonth - fStart) % 12 + 12) % 12;
    return Math.max(0, 11 - fiscalOffset);
}
function getResidentRetentionYearStartRange(year, fiscalStartMonth = 1) {
    const m = fiscalStartMonth >= 1 && fiscalStartMonth <= 12 ? fiscalStartMonth : 1;
    const start = new Date(Date.UTC(year, m - 1, 1));
    const end = new Date(Date.UTC(year, m, 0));
    return {
        periodStart: start.toISOString().slice(0, 10),
        periodEnd: end.toISOString().slice(0, 10),
    };
}
function getCurrentFiscalYear(fiscalStartMonth = 1) {
    const now = new Date();
    const calYear = now.getUTCFullYear();
    const calMonth = now.getUTCMonth() + 1;
    const startMonth = fiscalStartMonth >= 1 && fiscalStartMonth <= 12 ? fiscalStartMonth : 1;
    return calMonth < startMonth ? calYear - 1 : calYear;
}
function buildOccupancyReportFilters(input) {
    const basePeriod = asObject(input.baseFilters.period);
    if (normalizeReportCode(input.reportCode) === "box_score") {
        const boxScorePeriod = removeFuturePeriodFields(basePeriod);
        const boxScoreFilters = removeFutureFields(input.baseFilters);
        return {
            ...boxScoreFilters,
            property_group_ids: input.propertyCodes,
            period: {
                ...boxScorePeriod,
                period_type: input.periodType ?? "daterange",
                ...(input.periodStart ? { "daterange-start": input.periodStart } : {}),
                ...(input.periodEnd ? { "daterange-end": input.periodEnd } : {}),
            },
            summarize_by: input.summarizeBy ?? "unit_type",
            consolidate_by: input.baseFilters.consolidate_by ?? "no_consolidation",
            rows_with_no_data: input.baseFilters.rows_with_no_data ?? "1",
            data_set: input.baseFilters.data_set ?? "",
            show_drill_ins: input.baseFilters.show_drill_ins ?? "1",
        };
    }
    if (normalizeReportCode(input.reportCode) === "resident_retention") {
        const isCurrentFyr = input.periodType === "currentfyr" ||
            basePeriod.period_type === "currentfyr";
        const period = isCurrentFyr
            ? {
                period_type: "currentfyr",
            }
            : {
                ...basePeriod,
                period_type: input.periodType ?? basePeriod.period_type ?? "daterange",
                ...(input.periodStart ? { "daterange-start": input.periodStart } : {}),
                ...(input.periodEnd ? { "daterange-end": input.periodEnd } : {}),
                allow_future_periods: basePeriod.allow_future_periods ?? "1",
                trailing_periods: basePeriod.trailing_periods ?? 0,
                future_periods: input.residentRetentionFuturePeriods ??
                    basePeriod.future_periods ??
                    0,
            };
        return {
            ...input.baseFilters,
            property_group_ids: input.propertyCodes.map(toEntrataPropertyGroupId),
            period,
            summarize_by: input.baseFilters.summarize_by ?? "month",
            consolidate_by: input.baseFilters.consolidate_by ?? "no_consolidation",
            lease_status: input.baseFilters.lease_status ?? "all",
            early_move_out_grace_period: input.baseFilters.early_move_out_grace_period ?? "31",
            drill_in_column: input.baseFilters.drill_in_column ?? "",
            unit_type_id: input.baseFilters.unit_type_id ?? "",
            property_floorplan_id: input.baseFilters.property_floorplan_id ?? "",
            month_id: input.baseFilters.month_id ?? "",
            year_id: input.baseFilters.year_id ?? "",
            previous_summarize_by: input.baseFilters.previous_summarize_by ?? "",
            show_drill_ins: input.baseFilters.show_drill_ins ?? "1",
        };
    }
    throw new Error(`Unsupported occupancy reportCode: ${input.reportCode}`);
}
async function getDistinctPropertyCodes(input) {
    console.log("Fetching property codes for report batching", {
        companyId: input.companyId,
        organisationId: input.organisationId,
        fiscalYear: input.fiscalYear,
    });
    const pycs = await prisma.propertyYearConfiguration.findMany({
        where: {
            companyId: input.companyId,
            organisationId: input.organisationId,
            ...(input.fiscalYear !== undefined ? { fiscalYear: input.fiscalYear } : {}),
            isActive: true,
            isDemo: false,
        },
        select: {
            propertyCode: true,
        },
        distinct: ["propertyCode"],
        orderBy: {
            propertyCode: "asc",
        },
    });
    const propertyCodes = pycs
        .map((pyc) => pyc.propertyCode)
        .filter((value) => !!value && value.trim().length > 0);
    console.log("Property codes fetched successfully.", {
        count: propertyCodes.length,
        sample: propertyCodes.slice(0, 10),
    });
    return propertyCodes;
}
export async function syncEntrataReportDataJob(input) {
    console.log("Starting Entrata ReportData sync.", {
        reportCode: input.reportCode,
        propertyIds: input.propertyIds,
        fiscalYear: input.fiscalYear,
        includePriorYear: input.includePriorYear,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
    });
    const source = await prisma.integrationSource.findFirst({
        where: {
            id: input.integrationSourceId,
            companyId: input.companyId,
            organisationId: input.organisationId,
            sourceType: "entrata",
            isActive: true,
        },
        include: {
            config: true,
        },
    });
    if (!source?.config) {
        throw new IntegrationError({
            message: "No active Entrata source config found for report sync.",
            code: "ENTRATA_SOURCE_CONFIG_MISSING",
            category: "CONFIGURATION_ERROR",
            retryable: false,
            context: { ...input },
        });
    }
    let reportDefinition = await prisma.integrationReportDefinition.findFirst({
        where: {
            integrationSourceId: input.integrationSourceId,
            reportCode: input.reportCode,
            isEnabled: true,
        },
    });
    if (!reportDefinition &&
        normalizeReportCode(input.reportCode) === "resident_retention") {
        reportDefinition = await prisma.integrationReportDefinition.create({
            data: {
                companyId: input.companyId,
                organisationId: input.organisationId,
                integrationSourceId: input.integrationSourceId,
                reportCode: "resident_retention",
                reportName: "resident_retention",
                displayName: "Resident Retention",
                description: "Entrata resident_retention report used to sync monthly lease expirations and renewals.",
                reportVersion: "3.1",
                methodVersion: "r2",
                entityName: "Occupancy",
                endpointPath: "reports",
                methodName: "getReportData",
                sourceKeyFieldsJson: ["property_name", "months"],
                defaultParamsJson: {
                    filters: {
                        period: {
                            period_type: "currentfyr",
                        },
                        summarize_by: "month",
                        consolidate_by: "no_consolidation",
                        lease_status: "all",
                        early_move_out_grace_period: "31",
                        drill_in_column: "",
                        unit_type_id: "",
                        property_floorplan_id: "",
                        month_id: "",
                        year_id: "",
                        previous_summarize_by: "",
                        show_drill_ins: "1",
                    },
                },
                syncSettingsJson: {
                    minDelayMs: 1200,
                    requestBatchSize: 1,
                },
                isSystemDefined: true,
                isCustomReport: false,
                isEnabled: true,
            },
        });
    }
    if (!reportDefinition) {
        throw new IntegrationError({
            message: `Report definition not found for reportCode: ${input.reportCode}`,
            code: "REPORT_DEFINITION_MISSING",
            category: "CONFIGURATION_ERROR",
            retryable: false,
            context: { ...input },
        });
    }
    const connectionJson = asObject(source.config.connectionJson);
    const credentialsJson = asObject(source.config.credentialsJson);
    const baseUrl = getString(connectionJson.baseUrl) ?? "https://apis.entrata.com";
    const orgSlug = getString(connectionJson.orgSlug);
    if (!orgSlug) {
        throw new IntegrationError({
            message: "Entrata orgSlug is missing in IntegrationSourceConfig.connectionJson.",
            code: "ENTRATA_ORG_SLUG_MISSING",
            category: "CONFIGURATION_ERROR",
            retryable: false,
            context: { ...input },
        });
    }
    const apiKeyRef = getString(credentialsJson.apiKeyRef);
    let apiKey;
    if (apiKeyRef?.startsWith("env://")) {
        const envKey = apiKeyRef.replace("env://", "");
        apiKey = process.env[envKey];
    }
    if (!apiKey) {
        apiKey = getString(credentialsJson.apiKey);
    }
    if (!apiKey) {
        throw new IntegrationError({
            message: "Entrata API key not configured.",
            code: "ENTRATA_API_KEY_MISSING",
            category: "CONFIGURATION_ERROR",
            retryable: false,
            context: { ...input },
        });
    }
    const syncSettings = asObject(reportDefinition.syncSettingsJson);
    console.log(`[STEP 1/3: SYNC START] Syncing report data for reportCode: ${input.reportCode}`, {
        companyId: input.companyId,
        organisationId: input.organisationId,
        integrationSourceId: input.integrationSourceId,
        reportCode: input.reportCode,
        fiscalYear: input.fiscalYear,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        propertyIds: input.propertyIds,
    });
    const connector = new EntrataReportsConnector({
        baseUrl,
        orgSlug,
        minDelayMs: getNumberFromJson(syncSettings.minDelayMs, 1200),
    }, {
        apiKey,
    });
    const reportName = getString(reportDefinition.reportName) ?? reportDefinition.reportCode;
    const reportVersion = getString(reportDefinition.reportVersion) ??
        (normalizeReportCode(input.reportCode) === "resident_retention"
            ? "3.1"
            : undefined);
    const methodVersion = getString(reportDefinition.methodVersion) ?? "r2";
    const sourceKeyFields = getStringArray(reportDefinition.sourceKeyFieldsJson)
        .map((item) => getString(item))
        .filter((item) => !!item);
    const defaultFilters = getReportFilters(reportDefinition.defaultParamsJson);
    const baseFilters = {
        ...defaultFilters,
        ...(input.filters ?? {}),
    };
    const requestedPropertyIds = input.propertyIds
        ?.map((value) => String(value ?? "").trim())
        .filter((value) => value.length > 0) ?? [];
    const configuredRequestBatchSize = getNumberFromJson(syncSettings.requestBatchSize, 10);
    const requestBatchSize = Number.isFinite(configuredRequestBatchSize) &&
        configuredRequestBatchSize > 0
        ? Math.floor(configuredRequestBatchSize)
        : 10;
    const configuredBatchFilterKey = getString(syncSettings.batchFilterKey);
    const batchSource = getString(syncSettings.batchSource);
    const batchFilterKey = configuredBatchFilterKey ??
        (input.reportCode === "property_closings"
            ? "property_group_ids"
            : undefined);
    let filterBatches = [baseFilters];
    if (isOccupancyReport(input.reportCode)) {
        let propertyCodes = requestedPropertyIds.length > 0
            ? requestedPropertyIds
            : await getDistinctPropertyCodes({
                companyId: input.companyId,
                organisationId: input.organisationId,
                fiscalYear: input.fiscalYear ?? new Date().getFullYear(),
            });
        propertyCodes = propertyCodes.filter((value) => !!value && value.trim().length > 0);
        if (propertyCodes.length === 0) {
            throw new IntegrationError({
                message: "No property codes found for occupancy report sync.",
                code: "REPORT_PROPERTY_CODES_MISSING",
                category: "VALIDATION_ERROR",
                retryable: false,
                context: {
                    ...input,
                    requestedPropertyIds,
                },
            });
        }
        const basePeriod = asObject(baseFilters.period);
        const isCurrentFyrRequested = basePeriod.period_type === "currentfyr";
        const years = input.periodStart && input.periodEnd
            ? [input.fiscalYear]
            : input.fiscalYear
                ? input.includePriorYear
                    ? [input.fiscalYear - 1, input.fiscalYear]
                    : [input.fiscalYear]
                : isCurrentFyrRequested
                    ? [new Date().getUTCFullYear()]
                    : [];
        if (years.length === 0 &&
            !(input.periodStart && input.periodEnd) &&
            !isCurrentFyrRequested) {
            throw new IntegrationError({
                message: `${input.reportCode} sync requires fiscalYear, periodStart/periodEnd, or period_type currentfyr.`,
                code: "REPORT_PERIOD_MISSING",
                category: "VALIDATION_ERROR",
                retryable: false,
                context: { ...input },
            });
        }
        const numericPropertyCodes = propertyCodes
            .map((code) => Number.parseInt(code, 10))
            .filter((n) => Number.isInteger(n) && n > 0);
        const propertyRecords = await prisma.property.findMany({
            where: {
                companyId: input.companyId,
                organisationId: input.organisationId,
                OR: [
                    { code: { in: propertyCodes } },
                    ...(numericPropertyCodes.length > 0
                        ? [{ externalId: { in: numericPropertyCodes } }]
                        : []),
                ],
            },
            select: {
                id: true,
                code: true,
                externalId: true,
                fiscalYearStartMonth: true,
            },
        });
        const fiscalStartMonthByCode = new Map();
        for (const prop of propertyRecords) {
            const startMonth = prop.fiscalYearStartMonth &&
                prop.fiscalYearStartMonth >= 1 &&
                prop.fiscalYearStartMonth <= 12
                ? prop.fiscalYearStartMonth
                : 1;
            if (prop.code)
                fiscalStartMonthByCode.set(prop.code, startMonth);
            if (prop.externalId)
                fiscalStartMonthByCode.set(String(prop.externalId), startMonth);
        }
        const propertyCodesByStartMonth = new Map();
        for (const code of propertyCodes) {
            const startMonth = fiscalStartMonthByCode.get(code) ?? 1;
            const list = propertyCodesByStartMonth.get(startMonth) ?? [];
            list.push(code);
            propertyCodesByStartMonth.set(startMonth, list);
        }
        const boxScoreSummarizeByValues = normalizeReportCode(input.reportCode) === "box_score"
            ? getBoxScoreSummarizeByValues({
                ...(input.filters ? { inputFilters: input.filters } : {}),
                syncSettings,
            })
            : [];
        filterBatches = [];
        let skippedFutureRangeCount = 0;
        for (const [startMonth, groupCodes,] of propertyCodesByStartMonth.entries()) {
            const propertyCodeBatches = chunkArray(groupCodes, requestBatchSize);
            for (const propertyCodeBatch of propertyCodeBatches) {
                const cleanPropertyCodeBatch = propertyCodeBatch.filter((value) => !!value && value.trim().length > 0);
                if (cleanPropertyCodeBatch.length === 0) {
                    continue;
                }
                if (input.periodStart && input.periodEnd) {
                    const safeRange = clampFuturePeriodForReport({
                        reportCode: input.reportCode,
                        periodStart: input.periodStart,
                        periodEnd: input.periodEnd,
                    });
                    if (!safeRange) {
                        skippedFutureRangeCount += cleanPropertyCodeBatch.length;
                        continue;
                    }
                    if (normalizeReportCode(input.reportCode) === "box_score") {
                        for (const summarizeBy of boxScoreSummarizeByValues) {
                            filterBatches.push(buildOccupancyReportFilters({
                                reportCode: input.reportCode,
                                propertyCodes: cleanPropertyCodeBatch,
                                periodStart: safeRange.periodStart,
                                periodEnd: safeRange.periodEnd,
                                baseFilters,
                                summarizeBy,
                            }));
                        }
                    }
                    else {
                        // Keep Resident Retention single-property for now because future periods and row shapes
                        // are easier to validate per property. Box Score is the expensive month-by-month report.
                        for (const propertyCode of cleanPropertyCodeBatch) {
                            if (normalizeReportCode(input.reportCode) === "resident_retention" &&
                                isCurrentFyrRequested) {
                                filterBatches.push(buildOccupancyReportFilters({
                                    reportCode: input.reportCode,
                                    propertyCodes: [propertyCode],
                                    periodType: "currentfyr",
                                    baseFilters,
                                }));
                            }
                            else {
                                filterBatches.push(buildOccupancyReportFilters({
                                    reportCode: input.reportCode,
                                    propertyCodes: [propertyCode],
                                    periodStart: safeRange.periodStart,
                                    periodEnd: safeRange.periodEnd,
                                    baseFilters,
                                    residentRetentionFuturePeriods: normalizeReportCode(input.reportCode) === "resident_retention"
                                        ? getResidentRetentionFuturePeriodsToFiscalYearEnd(safeRange.periodStart, startMonth)
                                        : undefined,
                                }));
                            }
                        }
                    }
                    continue;
                }
                for (const year of years) {
                    if (!year) {
                        continue;
                    }
                    if (normalizeReportCode(input.reportCode) === "resident_retention") {
                        const isCurrentFyr = isCurrentFyrRequested ||
                            year === getCurrentFiscalYear(startMonth);
                        if (isCurrentFyr) {
                            for (const propertyCode of cleanPropertyCodeBatch) {
                                filterBatches.push(buildOccupancyReportFilters({
                                    reportCode: input.reportCode,
                                    propertyCodes: [propertyCode],
                                    periodType: "currentfyr",
                                    baseFilters,
                                }));
                            }
                            continue;
                        }
                    }
                    const ranges = normalizeReportCode(input.reportCode) === "resident_retention"
                        ? [getResidentRetentionYearStartRange(year, startMonth)]
                        : getMonthRanges({
                            fiscalYear: year,
                            fiscalYearStartMonth: startMonth,
                        });
                    for (const range of ranges) {
                        const safeRange = clampFuturePeriodForReport({
                            reportCode: input.reportCode,
                            periodStart: range.periodStart,
                            periodEnd: range.periodEnd,
                        });
                        if (!safeRange) {
                            skippedFutureRangeCount += cleanPropertyCodeBatch.length;
                            continue;
                        }
                        if (normalizeReportCode(input.reportCode) === "box_score") {
                            for (const summarizeBy of boxScoreSummarizeByValues) {
                                filterBatches.push(buildOccupancyReportFilters({
                                    reportCode: input.reportCode,
                                    propertyCodes: cleanPropertyCodeBatch,
                                    periodStart: safeRange.periodStart,
                                    periodEnd: safeRange.periodEnd,
                                    baseFilters,
                                    summarizeBy,
                                }));
                            }
                        }
                        else {
                            for (const propertyCode of cleanPropertyCodeBatch) {
                                filterBatches.push(buildOccupancyReportFilters({
                                    reportCode: input.reportCode,
                                    propertyCodes: [propertyCode],
                                    periodStart: safeRange.periodStart,
                                    periodEnd: safeRange.periodEnd,
                                    baseFilters,
                                    residentRetentionFuturePeriods: normalizeReportCode(input.reportCode) ===
                                        "resident_retention"
                                        ? getResidentRetentionFuturePeriodsToFiscalYearEnd(safeRange.periodStart, startMonth)
                                        : undefined,
                                }));
                            }
                        }
                    }
                }
            }
        }
        console.log("Occupancy report will be requested in report-specific batches.", {
            reportCode: input.reportCode,
            propertyCodeCount: propertyCodes.length,
            requestBatchSize,
            batchCount: filterBatches.length,
            source: requestedPropertyIds.length > 0 ? "REQUEST" : "PROPERTY_TABLE",
            fiscalYear: input.fiscalYear,
            includePriorYear: input.includePriorYear,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            skippedFutureRangeCount,
            boxScoreSummarizeByValues: normalizeReportCode(input.reportCode) === "box_score"
                ? boxScoreSummarizeByValues
                : undefined,
        });
    }
    else if (batchFilterKey &&
        (batchSource === "PropertyCodes" ||
            input.reportCode === "property_closings")) {
        let propertyCodes = requestedPropertyIds.length > 0
            ? requestedPropertyIds
            : await getDistinctPropertyCodes({
                companyId: input.companyId,
                organisationId: input.organisationId,
                fiscalYear: input.fiscalYear ?? new Date().getFullYear(),
            });
        propertyCodes = propertyCodes.filter((value) => !!value && value.trim().length > 0);
        if (propertyCodes.length === 0) {
            throw new IntegrationError({
                message: "No property codes found for report filter batching.",
                code: "REPORT_PROPERTY_CODES_MISSING",
                category: "VALIDATION_ERROR",
                retryable: false,
                context: {
                    ...input,
                    batchFilterKey,
                    batchSource,
                    requestedPropertyIds,
                },
            });
        }
        const propertyCodeBatches = chunkArray(propertyCodes, requestBatchSize);
        filterBatches = propertyCodeBatches.map((batch) => ({
            ...baseFilters,
            [batchFilterKey]: batch,
        }));
        console.log("Report will be requested in property batches.", {
            reportCode: input.reportCode,
            propertyCodeCount: propertyCodes.length,
            requestBatchSize,
            batchCount: filterBatches.length,
            batchFilterKey,
            source: requestedPropertyIds.length > 0 ? "REQUEST" : "PROPERTY_TABLE",
        });
    }
    else if (input.reportCode === "property_closings" &&
        requestedPropertyIds.length > 0) {
        filterBatches = [
            {
                ...baseFilters,
                property_group_ids: requestedPropertyIds,
            },
        ];
    }
    filterBatches = filterBatches.map((filters) => normalizeReportFilters(input.reportCode, filters));
    console.log("Calling Entrata report API.", {
        reportCode: input.reportCode,
        reportName,
        methodVersion,
        timeoutMs: getNumberFromJson(syncSettings.timeoutMs, 30000),
        maxRetries: getNumberFromJson(syncSettings.maxRetries, 3),
        filterBatchCount: filterBatches.length,
    });
    console.log(`[STEP 1/3: BATCHES PREPARED] Generated ${filterBatches.length} filter batch(es) for reportCode: ${input.reportCode}`);
    const syncRun = await prisma.integrationSyncRun.create({
        data: {
            companyId: input.companyId,
            organisationId: input.organisationId,
            integrationSourceId: input.integrationSourceId,
            entityName: "ReportData",
            syncType: "REPORT_DATA_SYNC",
            status: "STARTED",
            requestId: `entrata-report-${input.reportCode}-${Date.now()}`,
        },
    });
    const requestParamsJson = {
        reportName,
        reportVersion: reportVersion ?? null,
        methodVersion,
        filters: filterBatches.length === 1
            ? filterBatches[0]
            : {
                baseFilters,
                generatedBatchCount: filterBatches.length,
                reportCode: input.reportCode,
                fiscalYear: input.fiscalYear ?? null,
                includePriorYear: input.includePriorYear ?? false,
                periodStart: input.periodStart ?? null,
                periodEnd: input.periodEnd ?? null,
            },
    };
    const reportRun = await prisma.integrationReportRun.create({
        data: {
            companyId: input.companyId,
            organisationId: input.organisationId,
            integrationSourceId: input.integrationSourceId,
            reportDefinitionId: reportDefinition.id,
            syncRunId: syncRun.id,
            reportCode: reportDefinition.reportCode,
            reportName,
            reportVersion: reportVersion ?? null,
            methodVersion: methodVersion ?? null,
            requestParamsJson,
            status: "STARTED",
        },
    });
    let totalRows = 0;
    let staged = 0;
    let failedRequests = 0;
    const requestErrors = [];
    try {
        for (let batchIndex = 0; batchIndex < filterBatches.length; batchIndex++) {
            const filters = filterBatches[batchIndex];
            if (!filters) {
                continue;
            }
            const normalizedFilters = normalizeReportFilters(input.reportCode, filters);
            const requestId = `entrata-report-${input.reportCode}-${Date.now()}-${batchIndex + 1}`;
            console.log("Entrata report request filters:", {
                batchIndex: batchIndex + 1,
                batchCount: filterBatches.length,
                filters: normalizedFilters,
            });
            /*
             * IMPORTANT:
             * Keep error handling inside the batch loop.
             *
             * If one property/request fails, especially for resident_retention, the whole
             * sync should not stop. The failed request is recorded in staging_api_batches
             * with status FAILED, then the next property/request continues.
             */
            try {
                const response = await connector.fetchReportData({
                    requestId,
                    reportName,
                    reportVersion,
                    methodVersion,
                    filters: normalizedFilters,
                    timeoutMs: getNumberFromJson(syncSettings.timeoutMs, 30000),
                    maxRetries: getNumberFromJson(syncSettings.maxRetries, 3),
                    retryBaseDelayMs: getNumberFromJson(syncSettings.retryBaseDelayMs, 60000),
                });
                console.log("Entrata report API response received.", {
                    batchIndex: batchIndex + 1,
                });
                const rows = getReportRows(input.reportCode, response);
                totalRows += rows.length;
                const stagingBatch = await prisma.stagingApiBatch.create({
                    data: {
                        companyId: input.companyId,
                        organisationId: input.organisationId,
                        integrationSourceId: input.integrationSourceId,
                        syncRunId: syncRun.id,
                        entityName: "ReportData",
                        sourceMethod: "getReportData",
                        requestId,
                        responseCode: 200,
                        rawRequest: {
                            method: "getReportData",
                            methodVersion,
                            reportName,
                            reportVersion: reportVersion ?? null,
                            filters: normalizedFilters,
                        },
                        rawResponse: response,
                        status: "RECEIVED",
                    },
                });
                for (let index = 0; index < rows.length; index++) {
                    const row = rows[index];
                    if (!row) {
                        continue;
                    }
                    const sourceRecordId = buildSourceRecordId(reportDefinition.reportCode, row, sourceKeyFields, index, filters);
                    await prisma.stagingReportData.create({
                        data: {
                            companyId: input.companyId,
                            organisationId: input.organisationId,
                            integrationSourceId: input.integrationSourceId,
                            syncRunId: syncRun.id,
                            stagingBatchId: stagingBatch.id,
                            reportDefinitionId: reportDefinition.id,
                            reportRunId: reportRun.id,
                            reportCode: reportDefinition.reportCode,
                            reportName,
                            reportVersion: reportVersion ?? null,
                            sourceRecordId,
                            sourceHash: createSourceHash(row),
                            rawRecordPayload: row,
                            validationStatus: "VALID",
                            transformStatus: "PENDING",
                        },
                    });
                    staged++;
                }
                await prisma.stagingApiBatch.update({
                    where: {
                        id: stagingBatch.id,
                    },
                    data: {
                        status: "PARSED",
                    },
                });
            }
            catch (requestError) {
                failedRequests++;
                const errorMessage = requestError instanceof Error
                    ? requestError.message
                    : String(requestError);
                requestErrors.push({
                    batchIndex: batchIndex + 1,
                    batchCount: filterBatches.length,
                    requestId,
                    filters: normalizedFilters,
                    error: errorMessage,
                });
                console.error("Entrata report request failed. Continuing with next batch/property.", {
                    reportCode: input.reportCode,
                    batchIndex: batchIndex + 1,
                    batchCount: filterBatches.length,
                    requestId,
                    filters: normalizedFilters,
                    error: errorMessage,
                });
                await prisma.stagingApiBatch.create({
                    data: {
                        companyId: input.companyId,
                        organisationId: input.organisationId,
                        integrationSourceId: input.integrationSourceId,
                        syncRunId: syncRun.id,
                        entityName: "ReportData",
                        sourceMethod: "getReportData",
                        requestId,
                        responseCode: null,
                        rawRequest: {
                            method: "getReportData",
                            methodVersion,
                            reportName,
                            reportVersion: reportVersion ?? null,
                            filters: normalizedFilters,
                        },
                        rawResponse: {
                            error: errorMessage,
                        },
                        status: "FAILED",
                        errorMessage,
                    },
                });
                continue;
            }
        }
        const finalStatus = failedRequests > 0 && staged > 0
            ? "PARTIAL_FAILED"
            : failedRequests > 0
                ? "FAILED"
                : "COMPLETED";
        await prisma.integrationReportRun.update({
            where: {
                id: reportRun.id,
            },
            data: {
                rowCount: totalRows,
                recordsStaged: staged,
                recordsFailed: failedRequests,
                status: finalStatus,
                completedAt: new Date(),
                responseSummaryJson: {
                    totalRows,
                    staged,
                    failedRequests,
                    requestErrors: requestErrors.slice(0, 50),
                },
            },
        });
        await prisma.integrationSyncRun.update({
            where: {
                id: syncRun.id,
            },
            data: {
                status: finalStatus,
                completedAt: new Date(),
                recordsReceived: totalRows,
                recordsStaged: staged,
                recordsFailed: failedRequests,
            },
        });
        console.log(`[STEP 1/3: SYNC COMPLETE] Staged ${staged} row(s) from ${totalRows} received record(s) for reportCode: ${reportDefinition.reportCode}`, {
            syncRunId: syncRun.id,
            reportRunId: reportRun.id,
            recordsReceived: totalRows,
            recordsStaged: staged,
            failedRequests,
        });
        return {
            companyId: input.companyId,
            organisationId: input.organisationId,
            integrationSourceId: input.integrationSourceId,
            syncRunId: syncRun.id,
            reportRunId: reportRun.id,
            reportCode: reportDefinition.reportCode,
            recordsReceived: totalRows,
            recordsStaged: staged,
            recordsPendingTransform: staged,
            transformBatchSize: getNumberFromJson(syncSettings.transformBatchSize, 100),
        };
    }
    catch (error) {
        /*
         * Fatal error handler.
         *
         * This catches errors outside the per-request block, for example configuration,
         * database update failures, or unexpected code errors. Individual Entrata request
         * failures are already handled above and do not reach this block.
         */
        console.error("Entrata report sync failed.", {
            reportCode: input.reportCode,
            error,
        });
        await prisma.integrationReportRun.update({
            where: {
                id: reportRun.id,
            },
            data: {
                status: "FAILED",
                completedAt: new Date(),
                errorMessage: error instanceof Error ? error.message : String(error),
            },
        });
        await prisma.integrationSyncRun.update({
            where: {
                id: syncRun.id,
            },
            data: {
                status: "FAILED",
                completedAt: new Date(),
                errorMessage: error instanceof Error ? error.message : String(error),
            },
        });
        throw error;
    }
}
function normalizeReportFilters(reportCode, filters) {
    const normalized = structuredClone(filters);
    if (isBoxReport(reportCode)) {
        delete normalized.allow_future_periods;
        delete normalized.future_periods;
        delete normalized.trailing_periods;
        const period = normalized.period;
        if (period && typeof period === "object" && !Array.isArray(period)) {
            normalized.period = removeFuturePeriodFields(period);
        }
    }
    return normalized;
}
//# sourceMappingURL=sync-entrata-report-data.job.js.map