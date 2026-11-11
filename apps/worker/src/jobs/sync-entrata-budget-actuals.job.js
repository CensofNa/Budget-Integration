import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";
import { asArray, asObject, createSourceHash, getCredentialValue, getNumberFromJson, getSecretManager, getString, IntegrationError } from "@budget-integration/integration-core";
import { EntrataBudgetActualsConnector } from "@budget-integration/connector-entrata";
/** Throws a non-retryable CONFIGURATION_ERROR for missing Entrata setup fields. */
function throwMissingEntrataConfig(message, code, source, context) {
    throw new IntegrationError({
        message,
        code,
        category: "CONFIGURATION_ERROR",
        retryable: false,
        severity: "ERROR",
        context: {
            companyId: source.companyId,
            organisationId: source.organisationId,
            integrationSourceId: source.id,
            entityName: "BudgetActual",
            ...(context ?? {})
        }
    });
}
/**
 * Parses a "MM/YYYY" post-month string into a UTC Date on the 1st of the month.
 *
 * @param value e.g. "01/2026"
 * @returns Date at UTC midnight on the 1st (e.g. 2026-01-01T00:00:00.000Z),
 *          or null if the input is not a valid MM/YYYY post month.
 *
 * Validation is strict: requires exactly two digits for the month and four for
 * the year. To accept loose forms like "1/2026", relax the regex to
 * /^(\d{1,2})\/(\d{4})$/.
 */
function parsePostMonth(value) {
    const match = /^(\d{2})\/(\d{4})$/.exec(value.trim());
    if (!match)
        return null;
    const month = Number.parseInt(match[1], 10); // 1-based: 01 = January
    const year = Number.parseInt(match[2], 10);
    // Reject impossible months. (NaN is already ruled out by the regex.)
    if (month < 1 || month > 12)
        return null;
    // month - 1 converts the 1-based month to JS's 0-based month index.
    return new Date(Date.UTC(year, month - 1, 1));
}
/**
 * Formats a Date back into a "MM/YYYY" post-month string, reading in UTC so it
 * round-trips exactly with parsePostMonth regardless of the runtime's timezone.
 *
 * @param value any Date
 * @returns "MM/YYYY" (e.g. "01/2026")
 */
function formatPostMonth(value) {
    // +1 converts JS's 0-based month index back to a 1-based calendar month.
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    return `${month}/${value.getUTCFullYear()}`;
}
/**
 * Builds an inclusive list of consecutive post months between two "MM/YYYY"
 * strings.
 *
 * @param startPostMonth e.g. "01/2026"
 * @param endPostMonth   e.g. "05/2026"
 * @returns array of "MM/YYYY" strings from start to end inclusive.
 * @throws if either input is not a valid MM/YYYY post month.
 *
 * Returns [] if startPostMonth is later than endPostMonth.
 *
 * Example: ("01/2026", "05/2026") ->
 *   ["01/2026", "02/2026", "03/2026", "04/2026", "05/2026"]
 */
function buildMonthRange(startPostMonth, endPostMonth) {
    // Parse strings into UTC dates up front; reject invalid input loudly.
    const start = parsePostMonth(startPostMonth);
    const end = parsePostMonth(endPostMonth);
    if (start === null) {
        throw new Error(`Invalid startPostMonth: "${startPostMonth}" (expected MM/YYYY).`);
    }
    if (end === null) {
        throw new Error(`Invalid endPostMonth: "${endPostMonth}" (expected MM/YYYY).`);
    }
    const months = [];
    // start/end are already at UTC midnight on the 1st (parsePostMonth guarantees
    // this), so no further normalization is needed.
    const current = start;
    // <= makes the range inclusive of the end month. setUTCMonth handles the year
    // rollover automatically (UTC month 11 -> 12 becomes next January).
    while (current <= end) {
        months.push(formatPostMonth(current));
        current.setUTCMonth(current.getUTCMonth() + 1);
    }
    return months;
}
/** Extracts the `budgetVsActual` row array from the raw Entrata API response envelope. */
function getBudgetActualRows(response) {
    const root = asObject(response);
    const responseObj = asObject(root.response);
    const resultObj = asObject(responseObj.result);
    const budgetVsActualsObj = asObject(resultObj.budgetVsActuals);
    return asArray(budgetVsActualsObj.budgetVsActual);
}
/** Builds a stable, colon-delimited composite key that uniquely identifies a budget actual record across syncs. */
function buildSourceRecordId(input) {
    return [
        input.sourcePropertyId,
        input.sourceBudgetId,
        input.sourceGlTreeId,
        input.sourceGlAccountId,
        input.postMonth,
        input.accountingMethod
    ].join(":");
}
/** Parses the first numeric ID from a comma-separated budgetStatusTypeId string, falling back to defaultValue. */
function getBudgetStatusTypeId(value, defaultValue) {
    const raw = getString(value);
    if (!raw)
        return defaultValue;
    const first = raw.split(",")[0]?.trim();
    const parsed = Number(first);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}
/**
 * Queries the DB for all default property budgets in the given company/org, joined with their
 * GL tree and closing status. When `budgetIds` is provided, filters to only those source budget IDs.
 */
async function getBudgetActualRequestPlans(input) {
    const rows = await prisma.$queryRaw `
    select
      p.id as "propertyId",
      p.property_code as "sourcePropertyId",
      pb.id as "budgetId",
      pb.source_budget_id as "sourceBudgetId",
      gt.source_gl_tree_id as "sourceGlTreeId",
      pb.fiscal_year as "fiscalYear",
      pcs.gl_locked_through as "glLockedThrough"
    from public.property_budgets pb
    join public.properties p
      on p.id = pb.property_id
    left join public.property_closing_statuses pcs
      on pcs.property_id = p.id
    join lateral (
      select glt.source_gl_tree_id
      from public.gl_trees glt
      where glt.company_id = pb.company_id
        and glt.organisation_id = pb.organisation_id
      order by glt.created_at asc
      limit 1
    ) gt on true
    where pb.company_id = ${input.companyId}::uuid
      and pb.organisation_id = ${input.organisationId}::uuid
      and pb.is_default = true
      and (
        ${input.propertyId ?? null}::text is null
        or p.property_code = ${input.propertyId ?? null}::text
      )
    order by p.property_code, pb.fiscal_year;
  `;
    if (!input.budgetIds) {
        return rows;
    }
    const allowedBudgetIds = new Set(input.budgetIds
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0));
    return rows.filter((row) => allowedBudgetIds.has(row.sourceBudgetId));
}
// async function getBudgetActualRequestPlans(input: {
//   companyId: string;
//   organisationId: string;
//   budgetIds?: string;
//   propertyId?: string;
// }): Promise<BudgetActualRequestPlan[]> {
//   var query = prisma.$queryRaw<BudgetActualRequestPlan[]>`
//   select
//   p.id as "propertyId",
//   p.property_code as "sourcePropertyId",
//   pb.id as "budgetId",
//   pb.source_budget_id as "sourceBudgetId",
//   gt.source_gl_tree_id as "sourceGlTreeId",
//   pb.fiscal_year as "fiscalYear",
//   pcs.gl_locked_through as "glLockedThrough"
// from public.property_budgets pb
// join public.properties p
//   on p.id = pb.property_id
// left join public.property_closing_statuses pcs
//   on pcs.property_id = p.id
// join lateral (
//   select glt.source_gl_tree_id
//   from public.gl_trees glt
//   where glt.company_id = pb.company_id
//     and glt.organisation_id = pb.organisation_id
//   order by glt.created_at asc
//   limit 1
// ) gt on true
// where pb.company_id = ${input.companyId}::uuid
//   and pb.organisation_id = ${input.organisationId}::uuid
//   and pb.is_default = true
//   and p.property_code = ${input.propertyId}
// `;
//   console.log("[DEBUG] Executing getBudgetActualRequestPlans query with parameters:", {
//     companyId: input.companyId,
//     organisationId: input.organisationId,
//     propertyId: input.propertyId
//   });
//   const rows = await query;
//   if (!input.budgetIds) {
//     return rows;
//   }
//   const allowedBudgetIds = new Set(
//     input.budgetIds
//       .split(",")
//       .map((item) => item.trim())
//       .filter((item) => item.length > 0)
//   );
//   return rows.filter((row) => allowedBudgetIds.has(row.sourceBudgetId));
// }
/**
 * Main job handler: syncs budget actuals from Entrata into the staging layer.
 *
 * Flow:
 *  1. Resolves the active Entrata integration source and its credentials.
 *  2. Builds a list of request plans (property × budget × GL tree) from the DB.
 *  3. For each plan, calls `getBudgetActuals` on the Entrata API for the relevant post month(s).
 *  4. Upserts each returned row into `stagingBudgetActual`, skipping unchanged records (hash match).
 *  5. Updates the `integrationSyncRun` record with final counts and status.
 *
 * Returns null if no active source or no request plans are found.
 */
export async function syncEntrataBudgetActualsJob(input) {
    console.log("[INFO] Starting syncEntrataBudgetActualsJob with input:", input);
    const source = await prisma.integrationSource.findFirst({
        where: {
            companyId: input.companyId,
            organisationId: input.organisationId,
            id: input.integrationSourceId,
            sourceType: "entrata",
            isActive: true,
            entities: {
                some: {
                    entityName: "BudgetActual",
                    isEnabled: true
                }
            }
        },
        include: {
            config: true,
            entities: {
                where: {
                    entityName: "BudgetActual",
                    isEnabled: true
                }
            }
        }
    });
    if (!source || !source.config) {
        console.log("No active Entrata BudgetActual source found.");
        return null;
    }
    const entityConfig = source.entities[0];
    if (!entityConfig) {
        console.log("No active BudgetActual entity configuration found.");
        return null;
    }
    const syncSettings = entityConfig.syncSettingsJson;
    const credentials = source.config.credentialsJson;
    const connection = source.config.connectionJson;
    const apiKeyValue = getCredentialValue(credentials, "apiKey");
    const apiKeyRef = getCredentialValue(credentials, "apiKeyRef");
    const apiKey = apiKeyValue ??
        (apiKeyRef ? await getSecretManager().getSecret(apiKeyRef) : undefined);
    if (!apiKey) {
        throwMissingEntrataConfig("Entrata API key is not configured.", "ENTRATA_API_KEY_MISSING", source, { apiKeyRefConfigured: !!apiKeyRef });
    }
    const baseUrl = getString(connection?.baseUrl) ?? "https://apis.entrata.com";
    const orgSlug = getString(connection?.orgSlug);
    if (!orgSlug) {
        throwMissingEntrataConfig("Entrata orgSlug is missing in IntegrationSourceConfig.connectionJson.", "ENTRATA_ORG_SLUG_MISSING", source);
    }
    const connector = new EntrataBudgetActualsConnector({
        baseUrl,
        orgSlug,
        minDelayMs: getNumberFromJson(syncSettings?.minDelayMs, 1200)
    }, { apiKey });
    const timeoutMs = getNumberFromJson(syncSettings?.timeoutMs, 15000);
    const maxRetries = getNumberFromJson(syncSettings?.maxRetries, 3);
    const retryBaseDelayMs = getNumberFromJson(syncSettings?.retryBaseDelayMs, 20000);
    const accountingMethod = getString(input.accountingMethod) ??
        getString(syncSettings?.accountingMethod) ??
        "Accrual";
    const budgetStatusTypeId = getBudgetStatusTypeId(input.budgetStatusTypeIds ?? syncSettings?.budgetStatusTypeIds, getBudgetStatusTypeId(syncSettings?.budgetStatusTypeId, 1));
    const requestPlans = await getBudgetActualRequestPlans({
        companyId: source.companyId,
        organisationId: source.organisationId,
        ...(input.budgetIds
            ? { budgetIds: input.budgetIds }
            : {}),
        ...(input.propertyId
            ? { propertyId: input.propertyId }
            : {})
    });
    if (requestPlans.length === 0) {
        console.log("No BudgetActual request plans found.");
        return null;
    }
    console.log("[INFO] BudgetActual request plans loaded.", {
        count: requestPlans.length,
        manualStartPostMonth: input.startPostMonth,
        manualEndPostMonth: input.endPostMonth
    });
    const syncRun = await prisma.integrationSyncRun.create({
        data: {
            companyId: source.companyId,
            organisationId: source.organisationId,
            integrationSourceId: source.id,
            entityName: "BudgetActual",
            syncType: "BUDGET_ACTUAL_SYNC",
            status: "STARTED",
            requestId: `entrata-budget-actuals-${Date.now()}`
        }
    });
    let totalReceived = 0;
    let totalStaged = 0;
    let totalSkipped = 0;
    let totalPendingTransform = 0;
    let totalFailed = 0;
    try {
        var requestCount = 0;
        var requestCompletedCount = 0;
        requestCount = requestPlans.length;
        for (const plan of requestPlans) {
            requestCompletedCount++;
            let months = [];
            if (input.startPostMonth && input.endPostMonth) {
                const startMonth = parsePostMonth(input.startPostMonth);
                const endMonth = parsePostMonth(input.endPostMonth);
                if (!startMonth || !endMonth) {
                    throw new IntegrationError({
                        message: "Invalid manual postMonthFrom/postMonthTo value.",
                        code: "BUDGET_ACTUAL_INVALID_POST_MONTH_RANGE",
                        category: "VALIDATION_ERROR",
                        retryable: false,
                        severity: "ERROR",
                        context: {
                            startPostMonth: input.startPostMonth,
                            endPostMonth: input.endPostMonth
                        }
                    });
                }
                months = buildMonthRange(input.startPostMonth, input.endPostMonth);
            }
            else {
                if (!plan.glLockedThrough) {
                    console.warn("[WARN] Skipping BudgetActual. gl_locked_through is missing.", {
                        propertyId: plan.propertyId,
                        sourcePropertyId: plan.sourcePropertyId
                    });
                    continue;
                }
                months = [formatPostMonth(plan.glLockedThrough)];
            }
            console.log(`[INFO] Processing BudgetActual request plan. Request: Completed [${requestCompletedCount}], Failed [${totalFailed}] / Total [${requestCount}]`, {
                propertyId: plan.sourcePropertyId,
                budgetId: plan.sourceBudgetId,
                glTreeId: plan.sourceGlTreeId,
                fiscalYear: plan.fiscalYear,
                glLockedThrough: plan.glLockedThrough,
                months
            });
            for (const postMonth of months) {
                const requestId = `entrata-budget-actuals-${plan.sourcePropertyId}-${plan.sourceBudgetId}-${postMonth.replace("/", "")}-${Date.now()}`;
                try {
                    const rawRequest = {
                        method: "getBudgetActuals",
                        propertyId: plan.sourcePropertyId,
                        glTreeId: plan.sourceGlTreeId,
                        budgetId: plan.sourceBudgetId,
                        postMonthFrom: postMonth,
                        postMonthTo: postMonth,
                        glBookTypeIds: "",
                        budgetStatusTypeId,
                        accountingMethod
                    };
                    console.log(`[INFO] Calling getBudgetActuals. Request: ${requestCompletedCount}/${requestCount}`, rawRequest);
                    const response = await connector.fetchBudgetActuals({
                        requestId,
                        propertyId: plan.sourcePropertyId,
                        budgetId: plan.sourceBudgetId,
                        glTreeId: plan.sourceGlTreeId,
                        postMonthFrom: postMonth,
                        postMonthTo: postMonth,
                        glBookTypeIds: "",
                        budgetStatusTypeId,
                        accountingMethod,
                        timeoutMs,
                        maxRetries,
                        retryBaseDelayMs
                    });
                    const batch = await prisma.stagingApiBatch.create({
                        data: {
                            companyId: source.companyId,
                            organisationId: source.organisationId,
                            integrationSourceId: source.id,
                            syncRunId: syncRun.id,
                            entityName: "BudgetActual",
                            sourceMethod: "getBudgetActuals",
                            requestId,
                            responseCode: 200,
                            rawRequest: rawRequest,
                            rawResponse: response,
                            status: "RECEIVED"
                        }
                    });
                    const rows = getBudgetActualRows(response);
                    const postMonthDate = parsePostMonth(postMonth);
                    if (!postMonthDate) {
                        throw new Error(`Invalid generated postMonth: ${postMonth}`);
                    }
                    for (const row of rows) {
                        const sourceGlAccountId = getString(row.accountId);
                        if (!sourceGlAccountId) {
                            totalSkipped++;
                            continue;
                        }
                        totalReceived++;
                        const sourceRecordId = buildSourceRecordId({
                            sourcePropertyId: plan.sourcePropertyId,
                            sourceBudgetId: plan.sourceBudgetId,
                            sourceGlTreeId: plan.sourceGlTreeId,
                            sourceGlAccountId,
                            postMonth,
                            accountingMethod
                        });
                        const sourceHash = createSourceHash({
                            sourceRecordId,
                            row
                        });
                        const existingMap = await prisma.sourceRecordMap.findUnique({
                            where: {
                                companyId_organisationId_integrationSourceId_entityName_sourceRecordId: {
                                    companyId: source.companyId,
                                    organisationId: source.organisationId,
                                    integrationSourceId: source.id,
                                    entityName: "BudgetActual",
                                    sourceRecordId
                                }
                            }
                        });
                        const isUnchanged = existingMap?.sourceHash === sourceHash;
                        if (isUnchanged) {
                            totalSkipped++;
                        }
                        else {
                            totalPendingTransform++;
                        }
                        totalStaged++;
                        await prisma.stagingBudgetActual.upsert({
                            where: {
                                companyId_organisationId_integrationSourceId_sourceRecordId: {
                                    companyId: source.companyId,
                                    organisationId: source.organisationId,
                                    integrationSourceId: source.id,
                                    sourceRecordId
                                }
                            },
                            update: {
                                syncRunId: syncRun.id,
                                stagingBatchId: batch.id,
                                sourcePropertyId: plan.sourcePropertyId,
                                sourceBudgetId: plan.sourceBudgetId,
                                sourceGlTreeId: plan.sourceGlTreeId,
                                sourceGlAccountId,
                                sourceRecordId,
                                accountingMethod,
                                fiscalYear: postMonthDate.getUTCFullYear(),
                                postMonth: postMonthDate,
                                sourceHash,
                                rawPayloadJson: row,
                                validationStatus: isUnchanged ? "VALID" : "PENDING",
                                transformStatus: isUnchanged ? "SKIPPED" : "PENDING",
                                transformedAt: isUnchanged ? new Date() : null,
                                validationErrors: Prisma.JsonNull,
                                transformErrors: Prisma.JsonNull
                            },
                            create: {
                                companyId: source.companyId,
                                organisationId: source.organisationId,
                                integrationSourceId: source.id,
                                syncRunId: syncRun.id,
                                stagingBatchId: batch.id,
                                sourcePropertyId: plan.sourcePropertyId,
                                sourceBudgetId: plan.sourceBudgetId,
                                sourceGlTreeId: plan.sourceGlTreeId,
                                sourceGlAccountId,
                                sourceRecordId,
                                accountingMethod,
                                fiscalYear: postMonthDate.getUTCFullYear(),
                                postMonth: postMonthDate,
                                sourceHash,
                                rawPayloadJson: row,
                                validationStatus: isUnchanged ? "VALID" : "PENDING",
                                transformStatus: isUnchanged ? "SKIPPED" : "PENDING",
                                transformedAt: isUnchanged ? new Date() : null
                            }
                        });
                    }
                    await prisma.stagingApiBatch.update({
                        where: { id: batch.id },
                        data: { status: "PARSED" }
                    });
                    console.log(`[INFO] Completed getBudgetActuals. Request:[${requestCompletedCount}] Failed:[${totalFailed}]/${requestCount}`, {
                        propertyId: plan.sourcePropertyId,
                        budgetId: plan.sourceBudgetId,
                        glTreeId: plan.sourceGlTreeId,
                        postMonth,
                        rows: rows.length
                    });
                }
                catch (error) {
                    totalFailed++;
                    console.error(`[ERROR] BudgetActual request failed. Request: ${requestCompletedCount}/${requestCount} Failed: ${totalFailed}`, {
                        propertyId: plan.sourcePropertyId,
                        budgetId: plan.sourceBudgetId,
                        glTreeId: plan.sourceGlTreeId,
                        postMonth,
                        error
                    });
                }
            }
        }
        await prisma.integrationSyncRun.update({
            where: { id: syncRun.id },
            data: {
                status: totalFailed > 0 && totalPendingTransform > 0
                    ? "PARTIAL_FAILED"
                    : totalFailed > 0
                        ? "FAILED"
                        : totalPendingTransform > 0
                            ? "STAGED"
                            : "COMPLETED",
                recordsReceived: totalReceived,
                recordsStaged: totalStaged,
                recordsProcessed: totalSkipped,
                recordsFailed: totalFailed,
                completedAt: new Date(),
                errorMessage: totalFailed > 0 ? `${totalFailed} BudgetActual request(s) failed.` : null
            }
        });
        console.log(`Entrata BudgetActual sync completed. Received: ${totalReceived}, Staged: ${totalStaged}, Skipped: ${totalSkipped}, Pending transform: ${totalPendingTransform}, Failed: ${totalFailed}.`);
        return {
            companyId: source.companyId,
            organisationId: source.organisationId,
            integrationSourceId: source.id,
            syncRunId: syncRun.id,
            recordsReceived: totalReceived,
            recordsStaged: totalStaged,
            recordsSkipped: totalSkipped,
            recordsPendingTransform: totalPendingTransform
        };
    }
    catch (error) {
        await prisma.integrationSyncRun.update({
            where: { id: syncRun.id },
            data: {
                status: "FAILED",
                errorMessage: error instanceof Error ? error.message : String(error),
                completedAt: new Date()
            }
        });
        throw error;
    }
}
//# sourceMappingURL=sync-entrata-budget-actuals.job.js.map