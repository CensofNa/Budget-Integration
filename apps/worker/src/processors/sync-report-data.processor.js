import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";
import { PgBossWorker as Worker, QueueNames, acquireSyncLock, 
// logIntegrationError,
projectOccupancyFromReportsQueue, transformReportDataStagingQueue } from "@budget-integration/integration-core";
import { syncEntrataReportDataJob } from "../jobs/sync-entrata-report-data.job.js";
function isOccupancyReport(reportCode) {
    return reportCode === "box_score" || reportCode === "resident_retention";
}
function resolveBudgetYear(input) {
    if (typeof input.fiscalYear === "number" && Number.isFinite(input.fiscalYear)) {
        return input.fiscalYear;
    }
    if (input.periodStart) {
        const parsed = new Date(input.periodStart);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.getUTCFullYear();
        }
    }
    return null;
}
export const syncReportDataWorker = new Worker(QueueNames.SyncReportData, async (job) => {
    console.log("SyncReportData worker received job:", job.name, job.data);
    if (job.name !== "sync-entrata-report-data")
        return;
    let lock = null;
    try {
        console.log("Acquiring ReportData sync lock...");
        lock = await acquireSyncLock({
            companyId: job.data.companyId,
            organisationId: job.data.organisationId,
            integrationSourceId: job.data.integrationSourceId,
            entityName: `ReportData:${job.data.reportCode}`,
            ttlMs: 60 * 60 * 1000 // 1 hour
        });
        console.log("ReportData sync lock acquired.");
        const result = await syncEntrataReportDataJob(job.data);
        if (result.recordsPendingTransform > 0) {
            console.log(`[STEP 2/3: TRANSFORM ENQUEUED] Queuing transform job for reportCode: ${result.reportCode}`, {
                syncRunId: result.syncRunId,
                reportRunId: result.reportRunId,
                recordsPendingTransform: result.recordsPendingTransform,
            });
            await transformReportDataStagingQueue.add("transform-report-data-staging", {
                companyId: result.companyId,
                organisationId: result.organisationId,
                integrationSourceId: result.integrationSourceId,
                syncRunId: result.syncRunId,
                reportRunId: result.reportRunId,
                reportCode: result.reportCode,
                batchSize: result.transformBatchSize,
                entityName: "ReportData"
            }, {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 5000
                },
                removeOnComplete: 100,
                removeOnFail: 1000
            });
            if (isOccupancyReport(job.data.reportCode)) {
                const budgetYear = resolveBudgetYear(job.data);
                if (!budgetYear) {
                    console.warn("Skipping occupancy projection enqueue because budget year is missing.", {
                        reportCode: job.data.reportCode,
                        companyId: job.data.companyId,
                        organisationId: job.data.organisationId,
                        integrationSourceId: job.data.integrationSourceId,
                        periodStart: job.data.periodStart
                    });
                }
                else {
                    const numericPropertyIds = (job.data.propertyIds ?? [])
                        .map((id) => Number.parseInt(id, 10))
                        .filter((n) => Number.isInteger(n) && n > 0);
                    const properties = await prisma.property.findMany({
                        where: {
                            companyId: job.data.companyId,
                            organisationId: job.data.organisationId,
                            isDisabled: false,
                            ...(job.data.propertyIds?.length
                                ? {
                                    OR: [
                                        { code: { in: job.data.propertyIds } },
                                        ...(numericPropertyIds.length > 0 ? [{ externalId: { in: numericPropertyIds } }] : [])
                                    ]
                                }
                                : {})
                        },
                        select: {
                            id: true,
                            code: true
                        }
                    });
                    if (properties.length === 0) {
                        console.warn("Skipping occupancy projection enqueue because no matching properties were found.", {
                            reportCode: job.data.reportCode,
                            propertyCodes: job.data.propertyIds,
                            companyId: job.data.companyId,
                            organisationId: job.data.organisationId
                        });
                    }
                    else {
                        for (const property of properties) {
                            await projectOccupancyFromReportsQueue.add("project-occupancy-from-reports", {
                                companyId: job.data.companyId,
                                organisationId: job.data.organisationId,
                                integrationSourceId: job.data.integrationSourceId,
                                entityName: "Occupancy",
                                propertyId: property.id,
                                budgetYear
                            }, {
                                delay: 5 * 60 * 1000,
                                attempts: 3,
                                backoff: {
                                    type: "exponential",
                                    delay: 10000
                                },
                                removeOnComplete: 100,
                                removeOnFail: 1000
                            });
                        }
                        console.log(`[STEP 3/3: PROJECTION ENQUEUED] Queued ${properties.length} occupancy projection job(s) for reportCode: ${job.data.reportCode}`, {
                            reportCode: job.data.reportCode,
                            budgetYear,
                            propertyCount: properties.length,
                            syncRunId: result.syncRunId
                        });
                    }
                }
            }
        }
        return result;
    }
    catch (error) {
        // await logIntegrationError(
        //   prisma,
        //   {
        //     companyId: job.data.companyId,
        //     organisationId: job.data.organisationId,
        //     integrationSourceId: job.data.integrationSourceId,
        //     entityName: "ReportData",
        //     queueName: QueueNames.SyncReportData,
        //     jobName: job.name,
        //     bullJobId: String(job.id),
        //     contextJson: {
        //       reportCode: job.data.reportCode,
        //       propertyIds: job.data.propertyIds
        //     }
        //   },
        //   error
        // );
        throw error;
    }
    finally {
        if (lock) {
            await lock.release().catch(() => undefined);
        }
    }
}, {
    concurrency: 1,
    lockDuration: 30 * 60 * 1000,
    lockRenewTime: 5 * 60 * 1000,
    stalledInterval: 60 * 1000,
    maxStalledCount: 1
});
//# sourceMappingURL=sync-report-data.processor.js.map