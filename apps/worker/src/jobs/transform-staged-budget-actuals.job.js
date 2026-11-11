import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";
import { IntegrationError } from "@budget-integration/integration-core";
import { transformEntrataBudgetActual } from "@budget-integration/integration-core";
function getFiscalYearFromPostMonth(postMonth) {
    // BudgetActual fiscal year must follow the actual posting month, not the Entrata budget fiscal year.
    // Example: post_month 12/2025 must be stored as fiscal_year 2025 even when syncing Budget FY 2026.
    return postMonth.getUTCFullYear();
}
export async function transformStagedBudgetActualsJob(input) {
    const batchSize = input.batchSize ?? 100;
    console.log("[INFO] Starting BudgetActual staging transform.", {
        companyId: input.companyId,
        organisationId: input.organisationId,
        integrationSourceId: input.integrationSourceId,
        syncRunId: input.syncRunId,
        stagingBatchId: input.stagingBatchId,
        batchSize
    });
    let processed = 0;
    let transformed = 0;
    let skipped = 0;
    let failed = 0;
    while (true) {
        const rows = await prisma.stagingBudgetActual.findMany({
            where: {
                companyId: input.companyId,
                organisationId: input.organisationId,
                integrationSourceId: input.integrationSourceId,
                syncRunId: input.syncRunId,
                ...(input.stagingBatchId
                    ? {
                        stagingBatchId: input.stagingBatchId
                    }
                    : {}),
                transformStatus: "PENDING"
            },
            orderBy: {
                createdAt: "asc"
            },
            take: batchSize
        });
        if (rows.length === 0) {
            break;
        }
        console.log("[INFO] Processing BudgetActual transform batch.", {
            batchSize: rows.length,
            processed,
            transformed,
            skipped,
            failed
        });
        for (const row of rows) {
            processed++;
            try {
                if (!row.sourcePropertyId ||
                    !row.sourceBudgetId ||
                    !row.sourceGlTreeId ||
                    !row.sourceGlAccountId ||
                    !row.fiscalYear ||
                    !row.postMonth ||
                    !row.accountingMethod ||
                    !row.sourceHash) {
                    failed++;
                    console.error("[ERROR] BudgetActual staging row has missing required fields.", {
                        stagingId: row.id,
                        sourceRecordId: row.sourceRecordId
                    });
                    await prisma.stagingBudgetActual.update({
                        where: {
                            id: row.id
                        },
                        data: {
                            transformStatus: "FAILED",
                            transformErrors: {
                                error: "Missing required fields for BudgetActual transform."
                            },
                            transformedAt: new Date()
                        }
                    });
                    continue;
                }
                await transformEntrataBudgetActual(prisma, {
                    companyId: row.companyId,
                    organisationId: row.organisationId,
                    integrationSourceId: row.integrationSourceId,
                    stagingBudgetActualId: row.id,
                    sourcePropertyId: row.sourcePropertyId,
                    sourceBudgetId: row.sourceBudgetId,
                    sourceGlTreeId: row.sourceGlTreeId,
                    sourceGlAccountId: row.sourceGlAccountId,
                    fiscalYear: getFiscalYearFromPostMonth(row.postMonth),
                    postMonth: row.postMonth,
                    accountingMethod: row.accountingMethod,
                    sourceHash: row.sourceHash,
                    rawPayloadJson: row.rawPayloadJson
                });
                transformed++;
                await prisma.stagingBudgetActual.update({
                    where: {
                        id: row.id
                    },
                    data: {
                        transformStatus: "TRANSFORMED",
                        transformedAt: new Date(),
                        transformErrors: Prisma.JsonNull
                    }
                });
                console.log("[INFO] Successfully transformed staged BudgetActual.", {
                    stagingId: row.id,
                    sourceRecordId: row.sourceRecordId,
                    transformed: transformed
                });
            }
            catch (error) {
                failed++;
                console.error("[ERROR] Failed to transform staged BudgetActual.", {
                    stagingId: row.id,
                    sourceRecordId: row.sourceRecordId,
                    error
                });
                await prisma.stagingBudgetActual.update({
                    where: {
                        id: row.id
                    },
                    data: {
                        transformStatus: "FAILED",
                        transformedAt: new Date(),
                        transformErrors: {
                            message: error instanceof Error
                                ? error.message
                                : String(error),
                            stack: error instanceof Error
                                ? error.stack
                                : undefined
                        }
                    }
                });
            }
        }
    }
    console.log("[INFO] BudgetActual transform completed.", {
        processed,
        transformed,
        skipped,
        failed
    });
    await prisma.integrationSyncRun.update({
        where: {
            id: input.syncRunId
        },
        data: {
            status: failed > 0 && transformed > 0
                ? "PARTIAL_FAILED"
                : failed > 0
                    ? "FAILED"
                    : "COMPLETED",
            recordsProcessed: transformed,
            recordsFailed: failed,
            completedAt: new Date(),
            errorMessage: failed > 0
                ? `${failed} BudgetActual transform(s) failed.`
                : null
        }
    });
    return {
        processed,
        transformed,
        skipped,
        failed
    };
}
//# sourceMappingURL=transform-staged-budget-actuals.job.js.map