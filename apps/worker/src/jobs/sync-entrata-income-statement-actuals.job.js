import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";
import { processIncomeStatementPropertyQueue, } from "@budget-integration/integration-core";
import { EntrataReportsConnector, fetchEntrataProperties } from "@budget-integration/connector-entrata";
async function updatePropertyPostMonthFromEntrata(params) {
    try {
        const response = await fetchEntrataProperties({
            apiKey: params.apiKey,
            baseUrl: params.baseUrl,
            orgSlug: params.orgSlug,
            requestId: String(Date.now()),
            propertyId: params.sourcePropertyId,
        });
        const propertyList = response?.response?.result?.Properties?.Property || [];
        const propData = propertyList[0];
        if (!propData)
            return;
        const postMonths = propData.PostMonths || {};
        const parsePostMonth = (value) => {
            const raw = String(value || "").trim();
            if (!raw)
                return { raw: null, year: null, monthNo: null };
            const parts = raw.split("/");
            if (parts.length !== 2)
                return { raw, year: null, monthNo: null };
            const monthNo = Number.parseInt(parts[0] || "", 10);
            const year = Number.parseInt(parts[1] || "", 10);
            return {
                raw,
                monthNo: Number.isNaN(monthNo) ? null : monthNo,
                year: Number.isNaN(year) ? null : year,
            };
        };
        const arPost = parsePostMonth(postMonths.ArPostMonth);
        const apPost = parsePostMonth(postMonths.ApPostMonth);
        const glPost = parsePostMonth(postMonths.GlPostMonth);
        await prisma.propertyPostMonth.upsert({
            where: { propertyId: params.propertyId },
            update: {
                arPostMonth: arPost.raw,
                arPostYear: arPost.year,
                arPostMonthNo: arPost.monthNo,
                apPostMonth: apPost.raw,
                apPostYear: apPost.year,
                apPostMonthNo: apPost.monthNo,
                glPostMonth: glPost.raw,
                glPostYear: glPost.year,
                glPostMonthNo: glPost.monthNo,
                updatedAt: new Date(),
            },
            create: {
                companyId: params.companyId,
                organisationId: params.organisationId,
                propertyId: params.propertyId,
                arPostMonth: arPost.raw,
                arPostYear: arPost.year,
                arPostMonthNo: arPost.monthNo,
                apPostMonth: apPost.raw,
                apPostYear: apPost.year,
                apPostMonthNo: apPost.monthNo,
                glPostMonth: glPost.raw,
                glPostYear: glPost.year,
                glPostMonthNo: glPost.monthNo,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        });
    }
    catch (error) {
        console.error(`[WARN] Failed to update property post month from Entrata for ${params.sourcePropertyId}:`, error);
    }
}
function toJsonObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }
    return value;
}
function asNumber(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
function asString(value) {
    if (value === null || value === undefined) {
        return null;
    }
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}
function normalizePropertyCodes(values) {
    const normalized = values
        ?.map((value) => String(value).trim())
        .filter((value) => value.length > 0);
    if (!normalized || normalized.length === 0) {
        return undefined;
    }
    return Array.from(new Set(normalized));
}
function getLatestClosedMonthEnd(today = new Date()) {
    /*
      If today is July 15, 2026:
        new Date(Date.UTC(2026, 6, 0)) = June 30, 2026 (UTC)
  
      JavaScript month is zero-based.
    */
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
}
function getTrailingPeriodsFromFiscalYearStart(latestClosedMonthEnd, fiscalYearStartMonth = 1) {
    /*
      Default fiscal year = Jan-Dec.
  
      fiscalYearStartMonth:
        Jan = 1
        Feb = 2
        ...
        Dec = 12
    */
    const latestMonth = latestClosedMonthEnd.getMonth() + 1;
    if (latestMonth >= fiscalYearStartMonth) {
        return latestMonth - fiscalYearStartMonth + 1;
    }
    return latestMonth + (12 - fiscalYearStartMonth) + 1;
}
function sanitizeRequestPayload(payload) {
    /*
      Do not log API keys, cookies, auth headers, passwords, or secrets.
      The report body itself does not contain the API key, but this keeps the
      log function safe if headers are added later.
    */
    const cloned = structuredClone(payload);
    if (cloned.headers) {
        delete cloned.headers.Authorization;
        delete cloned.headers.authorization;
        delete cloned.headers["X-Api-Key"];
        delete cloned.headers["x-api-key"];
        delete cloned.headers.Cookie;
        delete cloned.headers.cookie;
    }
    if (cloned.auth?.apiKey) {
        cloned.auth.apiKey = "***";
    }
    return cloned;
}
function buildJobId(...parts) {
    return parts
        .filter((part) => part !== null && part !== undefined && String(part).trim() !== "")
        .map((part) => String(part)
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, "_"))
        .join("_");
}
async function getIncomeStatementReportDefinition(params) {
    const definition = await prisma.integrationReportDefinition.findFirst({
        where: {
            companyId: params.companyId,
            organisationId: params.organisationId,
            integrationSourceId: params.integrationSourceId,
            reportCode: "income_statement_actuals",
            isEnabled: true,
        },
        select: {
            id: true,
            reportCode: true,
            reportName: true,
            reportVersion: true,
            methodVersion: true,
            endpointPath: true,
            methodName: true,
            defaultParamsJson: true,
            syncSettingsJson: true,
        },
    });
    if (!definition) {
        throw new Error("Income Statement Actuals report definition not found. Please add integration_report_definitions row for report_code = income_statement_actuals.");
    }
    return definition;
}
async function resolveEntrataGlTreeId(params) {
    if (params.requestedGlTreeId?.trim()) {
        return params.requestedGlTreeId.trim();
    }
    /*
      Do not hardcode gl_tree_ids.
  
      Important:
        sourceRecordId may be an internal UUID in some implementations.
        Entrata expects a numeric GL tree id such as "1812".
  
      For now, only use sourceRecordId if it looks numeric. Otherwise fail with a
      clear message and pass glTreeId manually until the GL tree resolver is fixed.
    */
    const mappedGlTree = await prisma.sourceRecordMap.findFirst({
        where: {
            companyId: params.companyId,
            organisationId: params.organisationId,
            integrationSourceId: params.integrationSourceId,
            entityName: "GlTree",
            matchStatus: {
                in: ["AUTO_MATCHED", "MANUAL_MATCHED"],
            },
        },
        orderBy: {
            updatedAt: "desc",
        },
        select: {
            sourceRecordId: true,
        },
    });
    const candidate = mappedGlTree?.sourceRecordId
        ? String(mappedGlTree.sourceRecordId).trim()
        : "";
    if (/^\d+$/.test(candidate)) {
        return candidate;
    }
    throw new Error("Unable to resolve numeric Entrata GL tree id. Sync GL Trees/fix the resolver or pass glTreeId manually.");
}
async function resolveSyncablePropertiesForFiscalYear(params) {
    const requestedCodes = normalizePropertyCodes(params.propertyCodes);
    const candidateRows = await prisma.propertyYearConfiguration.findMany({
        where: {
            companyId: params.companyId,
            organisationId: params.organisationId,
            ...(requestedCodes
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
    const rowsByCode = new Map();
    for (const row of candidateRows) {
        const list = rowsByCode.get(row.propertyCode) ?? [];
        list.push(row);
        rowsByCode.set(row.propertyCode, list);
    }
    const skippedProperties = [];
    const properties = [];
    const selectBestRow = (code) => {
        const codeRows = rowsByCode.get(code);
        if (!codeRows || codeRows.length === 0)
            return null;
        const exactMatch = codeRows.find((r) => r.fiscalYear === params.fiscalYear);
        if (exactMatch)
            return exactMatch;
        const nextYearMatch = codeRows.find((r) => r.fiscalYear === params.fiscalYear + 1);
        if (nextYearMatch)
            return nextYearMatch;
        return codeRows[0];
    };
    const targetPropertyCodes = requestedCodes ?? Array.from(rowsByCode.keys());
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
function buildIncomeStatementRequest(params) {
    const defaultParams = toJsonObject(params.reportDefinition.defaultParamsJson);
    const defaultFilters = toJsonObject(defaultParams.filters);
    const filters = {
        ...defaultFilters,
        property_group_ids: [Number(params.sourcePropertyId)],
        /*
          Entrata expects gl_tree_ids as string in your working request.
        */
        gl_tree_ids: params.glTreeId,
        /*
          For now this is passed from request/config until Entrata confirms
          the source of valid gl_book_ids.
        */
        gl_book_ids: params.glBookIds,
        accounting_method: params.accountingMethod,
        location_type: defaultFilters.location_type ?? "property",
        period: params.periodType === "currentfyr"
            ? {
                period_type: "currentfyr",
            }
            : {
                ...(typeof defaultFilters.period === "object" && defaultFilters.period
                    ? defaultFilters.period
                    : {}),
                period_type: params.periodType,
                allow_future_periods: params.periodType === "pm" ? true : false,
                trailing_periods: params.trailingPeriods,
                future_periods: 0,
                ...(params.periodType === "pm" && params.pmFilterValue ? { pm: params.pmFilterValue } : {}),
            },
        expand_by_month: defaultFilters.expand_by_month ?? "1",
        gl_account_numbers: defaultFilters.gl_account_numbers ?? "1",
        show_periods_from: "0",
        consolidate_by: defaultFilters.consolidate_by ?? "no_consolidation",
        accounting_method_exception: defaultFilters.accounting_method_exception ?? "no_exception",
        summarize_accounts: defaultFilters.summarize_accounts ?? [],
        show_occupancy_percentages: defaultFilters.show_occupancy_percentages ?? "1",
        // zero_balances: defaultFilters.zero_balances ?? "0",
        zero_balances: "1",
        show_net_cash_flow_groups: defaultFilters.show_net_cash_flow_groups ?? "0",
        begin_end_cash_balances: defaultFilters.begin_end_cash_balances ?? "0",
        beginning_ending_cash_balance_detail: defaultFilters.beginning_ending_cash_balance_detail ?? 0,
        year_to_date: defaultFilters.year_to_date ?? "0",
        include_paused_journal_entries: defaultFilters.include_paused_journal_entries ?? "0",
        compare_periods: defaultFilters.compare_periods ?? "0",
        custom_period: defaultFilters.custom_period ?? {
            period_type: "pp",
            allow_future_periods: true,
        },
        percent_of_income: defaultFilters.percent_of_income ?? "0",
        departments: defaultFilters.departments ?? [],
        custom_tags: defaultFilters.custom_tags ?? [],
        expand_by_gl_book: defaultFilters.expand_by_gl_book ?? 0,
        show_drill_ins: defaultFilters.show_drill_ins ?? "1",
    };
    return {
        requestId: params.requestId,
        reportName: params.reportDefinition.reportName,
        reportVersion: params.reportDefinition.reportVersion ?? "4.1",
        methodVersion: params.reportDefinition.methodVersion ?? "r2",
        filters,
    };
}
function getEntrataResponseCode(response) {
    const code = response.response?.code;
    if (typeof code === "number") {
        return code;
    }
    return null;
}
function isSuccessfulEntrataResponse(response) {
    return getEntrataResponseCode(response) === 200;
}
export async function syncEntrataIncomeStatementActualsJob(data) {
    const syncRunId = data.syncRunId ?? randomUUID();
    await prisma.integrationSyncRun.create({
        data: {
            id: syncRunId,
            companyId: data.companyId,
            organisationId: data.organisationId,
            integrationSourceId: data.integrationSourceId,
            entityName: "IncomeStatementActuals",
            syncType: "IMPORT",
            status: "RUNNING",
            startedAt: new Date(),
        },
    });
    const reportDefinition = await getIncomeStatementReportDefinition({
        companyId: data.companyId,
        organisationId: data.organisationId,
        integrationSourceId: data.integrationSourceId,
    });
    const syncSettings = toJsonObject(reportDefinition.syncSettingsJson);
    const latestClosedMonthEnd = data.latestPostMonth
        ? new Date(data.latestPostMonth)
        : getLatestClosedMonthEnd();
    if (Number.isNaN(latestClosedMonthEnd.getTime())) {
        throw new Error(`Invalid latestPostMonth: ${data.latestPostMonth}`);
    }
    const fiscalYearStartMonth = Number(syncSettings.fiscalYearStartMonth ?? 1);
    const periodType = (data.periodType && data.periodType !== "pm")
        ? data.periodType
        : String(syncSettings.periodType ?? "currentfyr");
    const now = new Date();
    const currentMonthNo = now.getUTCMonth() + 1; // 1-based (Aug = 8)
    const currentYear = now.getUTCFullYear();
    const pmFilterValue = `${String(currentMonthNo).padStart(2, "0")}/${currentYear}`;
    const trailingPeriods = periodType === "pm"
        ? (data.trailingPeriods ?? (currentMonthNo - 1))
        : (data.trailingPeriods ?? getTrailingPeriodsFromFiscalYearStart(latestClosedMonthEnd, fiscalYearStartMonth));
    const accountingMethod = data.accountingMethod ?? String(syncSettings.accountingMethod ?? "accrual");
    const source = await prisma.integrationSource.findFirst({
        where: {
            id: data.integrationSourceId,
            companyId: data.companyId,
            organisationId: data.organisationId,
            sourceType: "entrata",
            isActive: true,
        },
        include: {
            config: true,
        },
    });
    if (!source?.config) {
        throw new Error("No active Entrata source config found for income statement sync.");
    }
    const connectionJson = toJsonObject(source.config.connectionJson);
    const credentialsJson = toJsonObject(source.config.credentialsJson);
    const baseUrl = asString(connectionJson.baseUrl) ?? "https://apis.entrata.com";
    const orgSlug = asString(connectionJson.orgSlug);
    if (!orgSlug) {
        throw new Error("Entrata orgSlug is missing in IntegrationSourceConfig.connectionJson.");
    }
    const apiKeyRef = asString(credentialsJson.apiKeyRef);
    let apiKey;
    if (apiKeyRef?.startsWith("env://")) {
        const envKey = apiKeyRef.replace("env://", "");
        apiKey = process.env[envKey];
    }
    if (!apiKey) {
        apiKey = asString(credentialsJson.apiKey) ?? undefined;
    }
    if (!apiKey) {
        throw new Error("Entrata API key not configured.");
    }
    if (!data.glBookIds || data.glBookIds.length === 0) {
        throw new Error("glBookIds is required for Income Statement Actuals sync until Entrata confirms the source of this field.");
    }
    const propertySelection = await resolveSyncablePropertiesForFiscalYear({
        companyId: data.companyId,
        organisationId: data.organisationId,
        fiscalYear: data.fiscalYear,
        includeDemo: data.includeDemo ?? false,
        ...(data.propertyIds && data.propertyIds.length > 0
            ? { propertyCodes: data.propertyIds }
            : {}),
    });
    if (propertySelection.skippedProperties.length > 0) {
        for (const skipped of propertySelection.skippedProperties) {
            console.warn(`[WARN] IncomeStatementActuals property ${skipped.propertyCode} skipped/not processed. Reason: ${skipped.reason}`, {
                syncRunId,
                companyId: data.companyId,
                organisationId: data.organisationId,
                fiscalYear: data.fiscalYear,
                propertyCode: skipped.propertyCode,
                reason: skipped.reason,
            });
        }
    }
    if (propertySelection.properties.length === 0) {
        const skippedSummary = propertySelection.skippedProperties
            .map((sp) => `${sp.propertyCode} (${sp.reason})`)
            .join(", ");
        console.warn(`[WARN] IncomeStatementActuals sync job completed with 0 processable properties. Skipped: ${skippedSummary}`, {
            syncRunId,
            skippedCount: propertySelection.skippedProperties.length,
        });
        await prisma.integrationSyncRun.update({
            where: { id: syncRunId },
            data: {
                status: "COMPLETED",
                recordsReceived: 0,
                recordsStaged: 0,
                recordsProcessed: 0,
                recordsFailed: 0,
                completedAt: new Date(),
                errorMessage: skippedSummary
                    ? `No syncable properties found. Skipped: ${skippedSummary}`
                    : "No syncable properties found."
            }
        });
        return {
            syncRunId,
            reportCode: reportDefinition.reportCode,
            reportName: reportDefinition.reportName,
            propertyCount: 0,
            successfulCount: 0,
            failedCount: 0,
            reportLogIds: [],
            processJobsQueued: 0,
            skippedProperties: propertySelection.skippedProperties,
        };
    }
    const connector = new EntrataReportsConnector({
        baseUrl,
        orgSlug,
        minDelayMs: asNumber(syncSettings.minDelayMs) ?? 1200,
    }, {
        apiKey,
    });
    const reportLogIds = [];
    const totalProperties = propertySelection.properties.length;
    let processedProperties = 0;
    let successfulCount = 0;
    let failedCount = 0;
    let processJobsQueued = 0;
    for (const syncProperty of propertySelection.properties) {
        const sourcePropertyId = syncProperty.propertyCode;
        const propertyId = syncProperty.propertyId;
        const propertyCode = syncProperty.propertyCode;
        const reportLogId = randomUUID();
        const requestId = String(Date.now());
        try {
            const glTreeId = await resolveEntrataGlTreeId({
                companyId: data.companyId,
                organisationId: data.organisationId,
                integrationSourceId: data.integrationSourceId,
                ...(data.glTreeId ? { requestedGlTreeId: data.glTreeId } : {}),
            });
            await updatePropertyPostMonthFromEntrata({
                propertyId,
                sourcePropertyId,
                apiKey,
                baseUrl,
                orgSlug,
                companyId: data.companyId,
                organisationId: data.organisationId,
            });
            const requestPayload = buildIncomeStatementRequest({
                requestId,
                reportDefinition,
                sourcePropertyId,
                glTreeId,
                glBookIds: data.glBookIds,
                accountingMethod,
                periodType,
                trailingPeriods,
                ...(pmFilterValue ? { pmFilterValue } : {}),
            });
            const sanitizedRequestPayload = {
                ...sanitizeRequestPayload(requestPayload),
                fiscalYear: data.fiscalYear,
            };
            const responsePayload = (await connector.fetchReportData(requestPayload));
            const responseCode = getEntrataResponseCode(responsePayload);
            const success = isSuccessfulEntrataResponse(responsePayload);
            await prisma.integrationReportApiLog.create({
                data: {
                    id: reportLogId,
                    companyId: data.companyId,
                    organisationId: data.organisationId,
                    integrationSourceId: data.integrationSourceId,
                    syncRunId,
                    reportCode: reportDefinition.reportCode,
                    reportName: reportDefinition.reportName,
                    reportVersion: reportDefinition.reportVersion,
                    methodVersion: reportDefinition.methodVersion,
                    sourcePropertyId,
                    propertyId,
                    propertyCode,
                    glTreeId,
                    glBookIds: data.glBookIds,
                    accountingMethod,
                    periodType,
                    latestPostMonth: latestClosedMonthEnd,
                    trailingPeriods,
                    futurePeriods: 0,
                    requestPayload: sanitizedRequestPayload,
                    responsePayload: responsePayload,
                    responseCode,
                    status: success ? "SUCCESS" : "FAILED",
                    errorMessage: success ? null : "Entrata income_statement report returned non-200 response.",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            });
            reportLogIds.push(reportLogId);
            if (success) {
                successfulCount += 1;
                if (data.autoProcess) {
                    try {
                        const processJob = await processIncomeStatementPropertyQueue.add("process-income-statement-property", {
                            companyId: data.companyId,
                            organisationId: data.organisationId,
                            integrationSourceId: data.integrationSourceId,
                            entityName: "IncomeStatementActuals",
                            syncRunId,
                            sourcePropertyId,
                            ...(propertyId ? { propertyId } : {}),
                            ...(propertyCode ? { propertyCode } : {}),
                            fiscalYear: data.fiscalYear,
                            updateReforecast: data.updateReforecast ?? false,
                            ...(data.reforecastCutoffMonth ? { reforecastCutoffMonth: data.reforecastCutoffMonth } : {}),
                        }, {
                            attempts: 2,
                            backoff: {
                                type: "exponential",
                                delay: 5000,
                            },
                            removeOnComplete: 100,
                            removeOnFail: 1000,
                            jobId: buildJobId("process-income-statement-property", data.integrationSourceId, syncRunId, sourcePropertyId),
                        });
                        if (processJob.id) {
                            processJobsQueued += 1;
                        }
                    }
                    catch (queueError) {
                        const queueErrorMessage = queueError instanceof Error
                            ? queueError.message
                            : JSON.stringify(queueError);
                        console.error("[ERROR] IncomeStatementActuals process job queueing failed for property.", {
                            syncRunId,
                            sourcePropertyId,
                            error: queueErrorMessage,
                        });
                    }
                }
            }
            else {
                failedCount += 1;
                console.error(`[ERROR] IncomeStatementActuals report request NOT PROCESSED (non-200 response code: ${responseCode}) for property ${propertyCode}`, {
                    syncRunId,
                    propertyCode,
                    sourcePropertyId,
                    responseCode,
                });
            }
            processedProperties += 1;
            console.log("[INFO] IncomeStatementActuals sync progress.", {
                syncRunId,
                sourcePropertyId,
                totalProperties,
                processedProperties,
                successfulCount,
                failedCount,
                processJobsQueued,
                skippedProperties: propertySelection.skippedProperties.length,
                remainingProperties: totalProperties - processedProperties,
            });
        }
        catch (error) {
            failedCount += 1;
            const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
            await prisma.integrationReportApiLog.create({
                data: {
                    id: reportLogId,
                    companyId: data.companyId,
                    organisationId: data.organisationId,
                    integrationSourceId: data.integrationSourceId,
                    syncRunId,
                    reportCode: reportDefinition.reportCode,
                    reportName: reportDefinition.reportName,
                    reportVersion: reportDefinition.reportVersion,
                    methodVersion: reportDefinition.methodVersion,
                    sourcePropertyId,
                    propertyId,
                    propertyCode,
                    glBookIds: data.glBookIds,
                    accountingMethod,
                    periodType,
                    latestPostMonth: latestClosedMonthEnd,
                    trailingPeriods,
                    futurePeriods: 0,
                    requestPayload: {
                        error: "REQUEST_NOT_COMPLETED",
                        sourcePropertyId,
                    },
                    responseCode: null,
                    status: "FAILED",
                    errorMessage,
                    errorPayload: {
                        error: errorMessage,
                        sourcePropertyId,
                    },
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            });
            reportLogIds.push(reportLogId);
            processedProperties += 1;
            console.error("[ERROR] IncomeStatementActuals sync failed for property.", {
                syncRunId,
                sourcePropertyId,
                error: errorMessage,
            });
            console.log("[INFO] IncomeStatementActuals sync progress.", {
                syncRunId,
                sourcePropertyId,
                totalProperties,
                processedProperties,
                successfulCount,
                failedCount,
                processJobsQueued,
                skippedProperties: propertySelection.skippedProperties.length,
                remainingProperties: totalProperties - processedProperties,
            });
        }
    }
    const finalSyncRunStatus = failedCount > 0 && successfulCount > 0
        ? "PARTIAL_FAILED"
        : failedCount > 0
            ? "FAILED"
            : "COMPLETED";
    await prisma.integrationSyncRun.update({
        where: { id: syncRunId },
        data: {
            status: finalSyncRunStatus,
            recordsReceived: totalProperties,
            recordsStaged: successfulCount,
            recordsProcessed: successfulCount,
            recordsFailed: failedCount,
            completedAt: new Date(),
            errorMessage: failedCount > 0 ? `${failedCount} property sync(s) failed.` : null
        }
    });
    return {
        syncRunId,
        reportCode: reportDefinition.reportCode,
        reportName: reportDefinition.reportName,
        propertyCount: propertySelection.properties.length,
        successfulCount,
        failedCount,
        reportLogIds,
        processJobsQueued,
        skippedProperties: propertySelection.skippedProperties,
    };
}
//# sourceMappingURL=sync-entrata-income-statement-actuals.job.js.map