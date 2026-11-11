import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@budget-integration/database";
import {
    processIncomeStatementPropertyQueue,
    type SyncIncomeStatementActualsJobData,
} from "@budget-integration/integration-core";

import { EntrataReportsConnector } from "@budget-integration/connector-entrata";

/**
 * Expected response shape from Entrata report API.
 * Keep this intentionally flexible because Entrata report payloads can vary.
 */
type EntrataReportResponse = {
    response?: {
        requestId?: string | number;
        code?: number;
        result?: Array<{
            reportData?: unknown[];
            [key: string]: unknown;
        }>;
        [key: string]: unknown;
    };
    [key: string]: unknown;
};

type IncomeStatementReportDefinition = {
    id: string;
    reportCode: string;
    reportName: string;
    reportVersion: string | null;
    methodVersion: string | null;
    endpointPath: string;
    methodName: string;
    defaultParamsJson: Prisma.JsonValue | null;
    syncSettingsJson: Prisma.JsonValue | null;
};

type SyncablePropertyForYear = {
    propertyId: string;
    propertyCode: string;
    propertyName: string | null;
    ownerName?: string | null;
    glLockedThrough?: Date | null;
};

type SkippedPropertyForYear = {
    propertyCode: string;
    reason:
    | "NOT_CONFIGURED_FOR_FISCAL_YEAR"
    | "INACTIVE_FOR_FISCAL_YEAR"
    | "DEMO_PROPERTY_EXCLUDED_FROM_ENTRATA_SYNC";
};

type ResolveSyncablePropertiesResult = {
    properties: SyncablePropertyForYear[];
    skippedProperties: SkippedPropertyForYear[];
};

type SyncIncomeStatementActualsResult = {
    syncRunId: string;
    reportCode: string;
    reportName: string;
    propertyCount: number;
    successfulCount: number;
    failedCount: number;
    reportLogIds: string[];
    processJobsQueued: number;
    skippedProperties: SkippedPropertyForYear[];
};

function toJsonObject(value: Prisma.JsonValue | null | undefined): Record<string, any> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {};
    }

    return value as Record<string, any>;
}

function asNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
}

function asString(value: unknown): string | null {
    if (value === null || value === undefined) {
        return null;
    }

    const text = String(value).trim();

    return text.length > 0 ? text : null;
}

function normalizePropertyCodes(values: string[] | undefined): string[] | undefined {
    const normalized = values
        ?.map((value) => String(value).trim())
        .filter((value) => value.length > 0);

    if (!normalized || normalized.length === 0) {
        return undefined;
    }

    return Array.from(new Set(normalized));
}


function getLatestClosedMonthEnd(today = new Date()): Date {
    /*
      If today is July 15, 2026:
        new Date(Date.UTC(2026, 6, 0)) = June 30, 2026 (UTC)
  
      JavaScript month is zero-based.
    */
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
}

function getMonthEndDateFromCutoff(cutoffStr: string): Date {
    const trimmed = cutoffStr.trim();
    const yyyyMm = trimmed.match(/^(\d{4})-(\d{1,2})$/);
    if (yyyyMm && yyyyMm[1] && yyyyMm[2]) {
        const year = parseInt(yyyyMm[1], 10);
        const month = parseInt(yyyyMm[2], 10);
        return new Date(Date.UTC(year, month, 0));
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed;
    }
    return getLatestClosedMonthEnd();
}

function getTrailingPeriodsFromFiscalYearStart(
    latestClosedMonthEnd: Date,
    fiscalYearStartMonth = 1
): number {
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

function sanitizeRequestPayload(payload: Record<string, any>): Record<string, any> {
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

function buildJobId(...parts: Array<string | number | null | undefined>): string {
    return parts
        .filter((part) => part !== null && part !== undefined && String(part).trim() !== "")
        .map((part) =>
            String(part)
                .trim()
                .replace(/[^a-zA-Z0-9_-]/g, "_")
        )
        .join("_");
}

async function getIncomeStatementReportDefinition(params: {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
}): Promise<IncomeStatementReportDefinition> {
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
        throw new Error(
            "Income Statement Actuals report definition not found. Please add integration_report_definitions row for report_code = income_statement_actuals."
        );
    }

    return definition;
}

/**
 * Resolves Entrata GL Tree ID based on property metadata:
 * - Livano properties: "1913"
 * - Non-Livano properties: "1812"
 * - Explicit glTreeId override if supplied
 */
function resolveGlTreeIdForProperty(
    property: { ownerName?: string | null; propertyName?: string | null; name?: string | null },
    explicitGlTreeId?: string
): string {
    if (explicitGlTreeId?.trim()) {
        return explicitGlTreeId.trim();
    }

    const nameToCheck = property.name || property.propertyName || "";
    const isLivano =
        (property.ownerName && property.ownerName.toLowerCase().includes("livano")) ||
        nameToCheck.toLowerCase().includes("livano");

    return isLivano ? "1913" : "1812";
}

async function resolveSyncablePropertiesForFiscalYear(params: {
    companyId: string;
    organisationId: string;
    fiscalYear: number;
    propertyCodes?: string[];
    includeDemo?: boolean;
    ownerFilter?: "all" | "livano" | "non-livano" | undefined;
    forceAll?: boolean | undefined;
    onProgress?: ((message: string) => void) | undefined;
}): Promise<ResolveSyncablePropertiesResult> {
    const requestedCodes = normalizePropertyCodes(params.propertyCodes);
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    let filterPropertyIds: string[] | null = null;
    let filterPropertyCodes: string[] | null = null;

    if (requestedCodes && requestedCodes.length > 0) {
        // Specific codes or IDs requested by user
        const uuids = requestedCodes.filter((c) => uuidRegex.test(c));
        const nonUuids = requestedCodes.filter((c) => !uuidRegex.test(c));
        filterPropertyIds = uuids.length > 0 ? uuids : null;
        filterPropertyCodes = nonUuids.length > 0 ? nonUuids : null;
    } else if (!params.forceAll) {
        // "Sync All" invoked: resolve only properties where is_gl_locked_changed = true!
        const resolveMsg = '[INFO] "Sync All" invoked: resolving properties where is_gl_locked_changed = true';
        console.log(resolveMsg);
        params?.onProgress?.(resolveMsg);
        const changedStatuses = await prisma.propertyClosingStatus.findMany({
            where: {
                companyId: params.companyId,
                organisationId: params.organisationId,
                isGlLockedChanged: true,
            },
            select: {
                propertyId: true,
                propertyName: true,
            },
        });

        const validIds = changedStatuses
            .map((s) => s.propertyId)
            .filter((id): id is string => Boolean(id && uuidRegex.test(id)));

        // In case any records didn't have propertyId yet, look them up by propertyName
        const missingNames = changedStatuses
            .filter((s) => !s.propertyId || !uuidRegex.test(s.propertyId))
            .map((s) => s.propertyName)
            .filter(Boolean);

        if (missingNames.length > 0) {
            const matchedProps = await prisma.property.findMany({
                where: {
                    companyId: params.companyId,
                    organisationId: params.organisationId,
                    name: { in: missingNames },
                },
                select: { id: true },
            });
            for (const p of matchedProps) {
                validIds.push(p.id);
            }
        }

        const uniqueChangedIds = Array.from(new Set(validIds));

        if (uniqueChangedIds.length === 0) {
            console.log(`[INFO] No valid properties found with is_gl_locked_changed = true. Skipping income statement sync.`);
            return {
                properties: [],
                skippedProperties: [],
            };
        }

        const foundMsg = `[INFO] Found ${uniqueChangedIds.length} property candidate(s) with changed GL lock status.`;
        console.log(foundMsg);
        params?.onProgress?.(foundMsg);
        filterPropertyIds = uniqueChangedIds;
    }

    const orConditions: Prisma.PropertyYearConfigurationWhereInput[] = [];
    if (filterPropertyCodes && filterPropertyCodes.length > 0) {
        orConditions.push({ propertyCode: { in: filterPropertyCodes } });
    }
    if (filterPropertyIds && filterPropertyIds.length > 0) {
        orConditions.push(
            { propertyId: { in: filterPropertyIds } },
            { propertyCode: { in: filterPropertyIds } }
        );
    }

    const candidateRows = await prisma.propertyYearConfiguration.findMany({
        where: {
            companyId: params.companyId,
            organisationId: params.organisationId,
            ...(orConditions.length > 0 ? { OR: orConditions } : {}),
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
    const rowsById = new Map<string, typeof candidateRows>();
    for (const row of candidateRows) {
        const listCode = rowsByCode.get(row.propertyCode) ?? [];
        listCode.push(row);
        rowsByCode.set(row.propertyCode, listCode);

        const listId = rowsById.get(row.propertyId) ?? [];
        listId.push(row);
        rowsById.set(row.propertyId, listId);
    }

    const skippedProperties: SkippedPropertyForYear[] = [];
    const properties: SyncablePropertyForYear[] = [];

    const selectBestRowForList = (rows?: typeof candidateRows) => {
        if (!rows || rows.length === 0) return null;

        const exactMatch = rows.find((r) => r.fiscalYear === params.fiscalYear);
        if (exactMatch) return exactMatch;

        const nextYearMatch = rows.find((r) => r.fiscalYear === params.fiscalYear + 1);
        if (nextYearMatch) return nextYearMatch;

        return rows[0];
    };

    const selectBestRow = (identifier: string) => {
        return selectBestRowForList(rowsByCode.get(identifier) ?? rowsById.get(identifier));
    };

    // If user provided propertyCodes, iterate over them (so missing ones can be reported as skipped).
    // Otherwise, iterate over all unique property IDs discovered in candidateRows.
    const targetPropertyIdentifiers = requestedCodes && requestedCodes.length > 0
        ? requestedCodes
        : Array.from(rowsById.keys());

    // Fetch canonical property records to get ownerName and name
    const allPropertyIds = Array.from(new Set(candidateRows.map((r) => r.propertyId)));
    const propertiesFromDb = allPropertyIds.length > 0
        ? await prisma.property.findMany({
            where: {
                id: { in: allPropertyIds },
                companyId: params.companyId,
                organisationId: params.organisationId,
            },
            select: {
                id: true,
                code: true,
                name: true,
                ownerName: true,
            },
        })
        : [];
    const propertyMap = new Map(propertiesFromDb.map((p) => [p.id, p]));

    // Fetch closing statuses to retrieve each property's glLockedThrough date
    const closingStatuses = allPropertyIds.length > 0
        ? await prisma.propertyClosingStatus.findMany({
            where: {
                companyId: params.companyId,
                organisationId: params.organisationId,
                propertyId: { in: allPropertyIds },
            },
            select: {
                propertyId: true,
                glLockedThrough: true,
            },
        })
        : [];

    const glLockedMap = new Map<string, Date>();
    for (const cs of closingStatuses) {
        if (cs.glLockedThrough && cs.propertyId) {
            glLockedMap.set(cs.propertyId, cs.glLockedThrough);
        }
    }

    const seenPropertyIds = new Set<string>();

    for (const identifier of targetPropertyIdentifiers) {
        const bestRow = selectBestRow(identifier);

        if (!bestRow) {
            skippedProperties.push({
                propertyCode: identifier,
                reason: "NOT_CONFIGURED_FOR_FISCAL_YEAR",
            });
            continue;
        }

        if (seenPropertyIds.has(bestRow.propertyId)) {
            continue;
        }
        seenPropertyIds.add(bestRow.propertyId);

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

        const propRecord = propertyMap.get(bestRow.propertyId);
        const ownerName = propRecord?.ownerName ?? null;
        const resolvedName = propRecord?.name ?? bestRow.propertyName;

        // Apply ownerFilter if supplied
        if (params.ownerFilter && params.ownerFilter !== "all") {
            const isLivano =
                (ownerName && ownerName.toLowerCase().includes("livano")) ||
                (resolvedName && resolvedName.toLowerCase().includes("livano"));

            if (params.ownerFilter === "livano" && !isLivano) {
                continue;
            }
            if (params.ownerFilter === "non-livano" && isLivano) {
                continue;
            }
        }

        const glLockedThrough = glLockedMap.get(bestRow.propertyId) ?? null;

        properties.push({
            propertyId: bestRow.propertyId,
            propertyCode: bestRow.propertyCode,
            propertyName: resolvedName,
            ownerName,
            glLockedThrough,
        });
    }

    return {
        properties,
        skippedProperties,
    };
}

function buildIncomeStatementRequest(params: {
    requestId: string;
    reportDefinition: IncomeStatementReportDefinition;
    sourcePropertyId: string;
    glTreeId: string;
    glBookIds: number[];
    accountingMethod: string;
    periodType: string;
    trailingPeriods: number;
    pmFilterValue?: string;
}): {
    requestId: string;
    reportName: string;
    reportVersion?: string;
    methodVersion?: string;
    filters: Record<string, unknown>;
} {
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
        accounting_method_exception:
            defaultFilters.accounting_method_exception ?? "no_exception",
        summarize_accounts: defaultFilters.summarize_accounts ?? [],
        show_occupancy_percentages: defaultFilters.show_occupancy_percentages ?? "1",
        // zero_balances: defaultFilters.zero_balances ?? "0",
        zero_balances: "1",
        show_net_cash_flow_groups: defaultFilters.show_net_cash_flow_groups ?? "0",
        begin_end_cash_balances: defaultFilters.begin_end_cash_balances ?? "0",
        beginning_ending_cash_balance_detail:
            defaultFilters.beginning_ending_cash_balance_detail ?? 0,
        year_to_date: defaultFilters.year_to_date ?? "0",
        include_paused_journal_entries:
            defaultFilters.include_paused_journal_entries ?? "0",
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

function getEntrataResponseCode(response: EntrataReportResponse): number | null {
    const code = response.response?.code;

    if (typeof code === "number") {
        return code;
    }

    return null;
}

function isSuccessfulEntrataResponse(response: EntrataReportResponse): boolean {
    return getEntrataResponseCode(response) === 200;
}

export async function syncEntrataIncomeStatementActualsJob(
    data: SyncIncomeStatementActualsJobData
): Promise<SyncIncomeStatementActualsResult> {
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

    const effectiveCutoffMonthEnd = data.reforecastCutoffMonth
        ? getMonthEndDateFromCutoff(data.reforecastCutoffMonth)
        : (data.latestPostMonth ? new Date(data.latestPostMonth) : getLatestClosedMonthEnd());

    if (Number.isNaN(effectiveCutoffMonthEnd.getTime())) {
        throw new Error(`Invalid cutoff month / latestPostMonth: ${data.reforecastCutoffMonth ?? data.latestPostMonth}`);
    }

    const hasExplicitCutoff = Boolean(data.reforecastCutoffMonth || data.latestPostMonth);
    const latestClosedMonthEnd = effectiveCutoffMonthEnd;

    const fiscalYearStartMonth = Number(syncSettings.fiscalYearStartMonth ?? 1);

    const periodType = ((data.periodType as string) && (data.periodType as string) !== "pm")
        ? (data.periodType as string)
        : String(syncSettings.periodType ?? "currentfyr");

    const now = new Date();
    const currentMonthNo = now.getUTCMonth() + 1; // 1-based (Aug = 8)
    const currentYear = now.getUTCFullYear();
    const pmFilterValue = `${String(currentMonthNo).padStart(2, "0")}/${currentYear}`;

    const trailingPeriods = periodType === "pm"
        ? (data.trailingPeriods ?? (currentMonthNo - 1))
        : (data.trailingPeriods ?? getTrailingPeriodsFromFiscalYearStart(latestClosedMonthEnd, fiscalYearStartMonth));

    const accountingMethod =
        data.accountingMethod ?? String(syncSettings.accountingMethod ?? "accrual");

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
    let apiKey: string | undefined;

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

    const glBookIds = data.glBookIds && data.glBookIds.length > 0 ? data.glBookIds : [1909];

    const propertySelection = await resolveSyncablePropertiesForFiscalYear({
        companyId: data.companyId,
        organisationId: data.organisationId,
        fiscalYear: data.fiscalYear,
        includeDemo: data.includeDemo ?? false,
        ...(data.ownerFilter ? { ownerFilter: data.ownerFilter } : {}),
        ...(data.forceAll !== undefined ? { forceAll: data.forceAll } : {}),
        ...((data.propertyCodes && data.propertyCodes.length > 0)
            ? { propertyCodes: data.propertyCodes }
            : (data.propertyIds && data.propertyIds.length > 0
                ? { propertyCodes: data.propertyIds }
                : {})),
    });

    if (propertySelection.skippedProperties.length > 0) {
        for (const skipped of propertySelection.skippedProperties) {
            console.warn(
                `[WARN] IncomeStatementActuals property ${skipped.propertyCode} skipped/not processed. Reason: ${skipped.reason}`,
                {
                    syncRunId,
                    companyId: data.companyId,
                    organisationId: data.organisationId,
                    fiscalYear: data.fiscalYear,
                    propertyCode: skipped.propertyCode,
                    reason: skipped.reason,
                }
            );
        }
    }

    if (propertySelection.properties.length === 0) {
        const skippedSummary = propertySelection.skippedProperties
            .map((sp) => `${sp.propertyCode} (${sp.reason})`)
            .join(", ");

        console.warn(
            `[WARN] IncomeStatementActuals sync job completed with 0 processable properties. Skipped: ${skippedSummary}`,
            {
                syncRunId,
                skippedCount: propertySelection.skippedProperties.length,
            }
        );

        await prisma.integrationSyncRun.update({
            where: { id: syncRunId },
            data: {
                status: "COMPLETED",
                recordsReceived: 0,
                recordsStaged: 0,
                recordsProcessed: 0,
                recordsFailed: 0,
                ...(data.autoProcess ? {} : { completedAt: new Date() }),
                errorMessage: skippedSummary
                    ? `No syncable properties found. Skipped: ${skippedSummary}`
                    : "No properties with changed GL lock status found to sync (is_gl_locked_changed = true)."
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

    const connector = new EntrataReportsConnector(
        {
            baseUrl,
            orgSlug,
            minDelayMs: asNumber(syncSettings.minDelayMs) ?? 1200,
        },
        {
            apiKey,
        }
    );

    const reportLogIds: string[] = [];
    const totalProperties = propertySelection.properties.length;
    let processedProperties = 0;
    let successfulCount = 0;
    let failedCount = 0;
    let processJobsQueued = 0;

    // Initialize tracking records for all properties to be synced
    for (const sp of propertySelection.properties) {
        await prisma.integrationPropertyProcessRun.upsert({
            where: {
                companyId_organisationId_integrationSourceId_syncRunId_entityName_sourcePropertyId: {
                    companyId: data.companyId,
                    organisationId: data.organisationId,
                    integrationSourceId: data.integrationSourceId,
                    syncRunId,
                    entityName: "IncomeStatementActuals",
                    sourcePropertyId: sp.propertyCode,
                },
            },
            create: {
                companyId: data.companyId,
                organisationId: data.organisationId,
                integrationSourceId: data.integrationSourceId,
                syncRunId,
                entityName: "IncomeStatementActuals",
                sourcePropertyId: sp.propertyCode,
                propertyId: sp.propertyId,
                propertyCode: sp.propertyCode,
                fiscalYear: data.fiscalYear,
                status: "PENDING",
            },
            update: {
                propertyId: sp.propertyId,
                propertyCode: sp.propertyCode,
                fiscalYear: data.fiscalYear,
                status: "PENDING",
            },
        }).catch((err) => console.warn("[WARN] Could not upsert initial process run:", err.message));
    }

    for (const syncProperty of propertySelection.properties) {
        const sourcePropertyId = syncProperty.propertyCode;
        const propertyId = syncProperty.propertyId;
        const propertyCode = syncProperty.propertyCode;
        const glTreeId = resolveGlTreeIdForProperty(syncProperty, data.glTreeId);

        const targetCutoffDateStr = data.latestPostMonth ?? (data.reforecastCutoffMonth ? getMonthEndDateFromCutoff(data.reforecastCutoffMonth).toISOString() : undefined);

        if (targetCutoffDateStr) {
            const parsedLatestPostMonth = new Date(targetCutoffDateStr);
            if (!Number.isNaN(parsedLatestPostMonth.getTime())) {
                const closingOrConditions: Prisma.PropertyClosingStatusWhereInput[] = [];
                if (syncProperty.propertyId) {
                    closingOrConditions.push({ propertyId: syncProperty.propertyId });
                }
                const nameToMatch = syncProperty.propertyName || (syncProperty as any).name;
                if (nameToMatch) {
                    closingOrConditions.push({ propertyName: nameToMatch });
                }
                if (closingOrConditions.length > 0) {
                    await prisma.propertyClosingStatus.updateMany({
                        where: {
                            companyId: data.companyId,
                            organisationId: data.organisationId,
                            OR: closingOrConditions,
                        },
                        data: {
                            glLockedThrough: parsedLatestPostMonth,
                            updatedAt: new Date(),
                        },
                    }).catch((err) => {
                        console.warn(`[WARN] Failed to update glLockedThrough to latestPostMonth for property ${propertyCode}:`, err.message);
                    });
                }
            }
        }

        const propertyMonthEnd = syncProperty.glLockedThrough && !hasExplicitCutoff
            ? syncProperty.glLockedThrough
            : effectiveCutoffMonthEnd;

        const propertyTrailingPeriods = (data.trailingPeriods !== undefined && data.trailingPeriods !== null)
            ? data.trailingPeriods
            : (periodType === "pm"
                ? (propertyMonthEnd.getUTCMonth() + 1 - 1)
                : getTrailingPeriodsFromFiscalYearStart(propertyMonthEnd, fiscalYearStartMonth));

        const propertyPmFilterValue = `${String(propertyMonthEnd.getUTCMonth() + 1).padStart(2, "0")}/${propertyMonthEnd.getUTCFullYear()}`;

        const reportLogId = randomUUID();
        const requestId = String(Date.now());
        const propDisplayName = syncProperty.propertyName || propertyCode;
        const currentIdx = processedProperties + 1;
        const callingMsg = `[INFO] [${currentIdx}/${totalProperties}] Calling Entrata for ${propDisplayName} (code: ${propertyCode})...`;
        console.log(callingMsg);
        data.onProgress?.(callingMsg);

        try {
            const requestPayload = buildIncomeStatementRequest({
                requestId,
                reportDefinition,
                sourcePropertyId,
                glTreeId,
                glBookIds,
                accountingMethod,
                periodType,
                trailingPeriods: propertyTrailingPeriods,
                ...(propertyPmFilterValue ? { pmFilterValue: propertyPmFilterValue } : {}),
            });

            const sanitizedRequestPayload = {
                ...sanitizeRequestPayload(requestPayload),
                fiscalYear: data.fiscalYear,
            };

            const responsePayload =
                (await connector.fetchReportData(requestPayload)) as EntrataReportResponse;

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
                    glBookIds: glBookIds as unknown as Prisma.InputJsonValue,
                    accountingMethod,

                    periodType,
                    latestPostMonth: propertyMonthEnd,
                    trailingPeriods: propertyTrailingPeriods,
                    futurePeriods: 0,

                    requestPayload: sanitizedRequestPayload as Prisma.InputJsonValue,
                    responsePayload: responsePayload as Prisma.InputJsonValue,

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
                const successMsg = `[INFO] [${currentIdx}/${totalProperties}] ${propDisplayName}: Entrata response received (200 OK).`;
                data.onProgress?.(successMsg);
                await prisma.integrationPropertyProcessRun.updateMany({
                    where: {
                        syncRunId,
                        sourcePropertyId,
                    },
                    data: {
                        status: "QUEUED",
                    },
                }).catch(() => undefined);

                if (data.autoProcess) {
                    try {
                        const processJob = await processIncomeStatementPropertyQueue.add(
                            "process-income-statement-property",
                            {
                                companyId: data.companyId,
                                organisationId: data.organisationId,
                                integrationSourceId: data.integrationSourceId,
                                entityName: "IncomeStatementActuals",

                                syncRunId,
                                sourcePropertyId,

                                ...(propertyId ? { propertyId } : {}),
                                ...(propertyCode ? { propertyCode } : {}),

                                fiscalYear: data.fiscalYear,
                                updateReforecast: data.updateReforecast ?? Boolean(data.reforecastCutoffMonth),
                                ...(data.reforecastCutoffMonth ? { reforecastCutoffMonth: data.reforecastCutoffMonth } : (data.latestPostMonth ? { reforecastCutoffMonth: String(data.latestPostMonth).slice(0, 7) } : {})),
                            },
                            {
                                attempts: 2,
                                backoff: {
                                    type: "exponential",
                                    delay: 5000,
                                },
                                removeOnComplete: 100,
                                removeOnFail: 1000,
                                jobId: buildJobId(
                                    "process-income-statement-property",
                                    data.integrationSourceId,
                                    syncRunId,
                                    sourcePropertyId
                                ),
                            }
                        );

                        if (processJob.id) {
                            processJobsQueued += 1;
                        }
                    } catch (queueError) {
                        const queueErrorMessage =
                            queueError instanceof Error
                                ? queueError.message
                                : JSON.stringify(queueError);

                        console.error(
                            "[ERROR] IncomeStatementActuals process job queueing failed for property.",
                            {
                                syncRunId,
                                sourcePropertyId,
                                error: queueErrorMessage,
                            }
                        );
                    }
                }
            } else {
                failedCount += 1;
                const failed200Msg = `[WARN] [${currentIdx}/${totalProperties}] ${propDisplayName}: Entrata non-200 response (${responseCode}).`;
                data.onProgress?.(failed200Msg);
                await prisma.integrationPropertyProcessRun.updateMany({
                    where: {
                        syncRunId,
                        sourcePropertyId,
                    },
                    data: {
                        status: "FAILED",
                        errorMessage: `Entrata API non-200 code: ${responseCode}`,
                    },
                }).catch(() => undefined);
                console.error(
                    `[ERROR] IncomeStatementActuals report request NOT PROCESSED (non-200 response code: ${responseCode}) for property ${propertyCode}`,
                    {
                        syncRunId,
                        propertyCode,
                        sourcePropertyId,
                        responseCode,
                    }
                );
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

        } catch (error) {
            failedCount += 1;
            const catchMsg = `[ERROR] [${processedProperties + 1}/${totalProperties}] Failed for ${syncProperty.propertyName || syncProperty.propertyCode}: ${error instanceof Error ? error.message : String(error)}`;
            data.onProgress?.(catchMsg);

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

                    glBookIds: data.glBookIds as unknown as Prisma.InputJsonValue,
                    accountingMethod,

                    periodType,
                    latestPostMonth: latestClosedMonthEnd,
                    trailingPeriods,
                    futurePeriods: 0,

                    requestPayload: {
                        error: "REQUEST_NOT_COMPLETED",
                        sourcePropertyId,
                    } as Prisma.InputJsonValue,

                    responseCode: null,
                    status: "FAILED",
                    errorMessage,
                    errorPayload: {
                        error: errorMessage,
                        sourcePropertyId,
                    } as Prisma.InputJsonValue,

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

    const finalSyncRunStatus = data.autoProcess
        ? (failedCount > 0 ? "PROCESSING_WITH_ERRORS" : "PROCESSING")
        : (failedCount > 0 && successfulCount > 0
            ? "PARTIAL_FAILED"
            : failedCount > 0
                ? "FAILED"
                : "COMPLETED");

    await prisma.integrationSyncRun.update({
        where: { id: syncRunId },
        data: {
            status: finalSyncRunStatus,
            recordsReceived: totalProperties,
            recordsStaged: successfulCount,
            recordsProcessed: successfulCount,
            recordsFailed: failedCount,
            ...(data.autoProcess ? {} : { completedAt: new Date() }),
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
