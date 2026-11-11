import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";
import { getReportTransformer } from "@budget-integration/integration-core";
export async function transformStagedReportDataJob(input = {}) {
    const batchSize = input.batchSize ?? 100;
    let totalTransformed = 0;
    let totalFailed = 0;
    let totalRecords = 0;
    /*
     * Keep track of rows handled by this invocation. This prevents an endless
     * loop when retryFailedRows = true and a row fails again, because it remains
     * FAILED in the database and would otherwise be fetched again immediately.
     */
    const handledRowIds = new Set();
    while (true) {
        const rows = await prisma.stagingReportData.findMany({
            where: {
                ...(handledRowIds.size > 0
                    ? { id: { notIn: Array.from(handledRowIds) } }
                    : {}),
                ...(input.companyId ? { companyId: input.companyId } : {}),
                ...(input.organisationId ? { organisationId: input.organisationId } : {}),
                ...(input.integrationSourceId
                    ? { integrationSourceId: input.integrationSourceId }
                    : {}),
                ...(input.syncRunId ? { syncRunId: input.syncRunId } : {}),
                ...(input.reportRunId ? { reportRunId: input.reportRunId } : {}),
                ...(input.reportCode ? { reportCode: input.reportCode } : {}),
                validationStatus: { in: ["PENDING", "VALID"] },
                transformStatus: input.retryFailedRows
                    ? { in: ["PENDING", "FAILED"] }
                    : "PENDING"
            },
            orderBy: {
                stagedAt: "asc"
            },
            take: batchSize
        });
        if (rows.length === 0)
            break;
        totalRecords += rows.length;
        for (const row of rows) {
            handledRowIds.add(row.id);
            try {
                const transformer = getReportTransformer(row.reportCode);
                if (!transformer) {
                    throw new Error(`No transformer registered for reportCode: ${row.reportCode}`);
                }
                console.log(`Transforming staged report data with id: ${row.id} using transformer for reportCode: ${row.reportCode}`);
                await transformer(prisma, {
                    stagingReportDataId: row.id,
                    companyId: row.companyId,
                    organisationId: row.organisationId,
                    integrationSourceId: row.integrationSourceId,
                    reportCode: row.reportCode,
                    sourceRecordId: row.sourceRecordId,
                    sourceHash: row.sourceHash,
                    rawRecordPayload: row.rawRecordPayload
                });
                totalTransformed++;
                console.log(`Transformed staged report: ${totalTransformed}/${totalRecords}`);
            }
            catch (error) {
                totalFailed++;
                console.log(`Failed to transform staged report data with id: ${row.id}. Error: ${error instanceof Error ? error.message : String(error)}. Total failed: ${totalFailed}/${totalRecords}`);
                await prisma.stagingReportData.update({
                    where: { id: row.id },
                    data: {
                        /*
                         * Do not mark the row INVALID for transform errors.
                         *
                         * Some failures are retryable, for example missing property mapping or a
                         * temporary database issue. Keeping validationStatus as VALID allows us to
                         * reset/retry FAILED rows later without re-staging from Entrata.
                         */
                        transformStatus: "FAILED",
                        transformErrors: {
                            message: error instanceof Error ? error.message : String(error),
                            reportCode: row.reportCode,
                            sourceRecordId: row.sourceRecordId,
                            failedAt: new Date().toISOString()
                        }
                    }
                });
            }
        }
    }
    if (input.reportRunId) {
        await prisma.integrationReportRun.update({
            where: { id: input.reportRunId },
            data: {
                recordsTransformed: totalTransformed,
                recordsFailed: totalFailed,
                status: totalFailed > 0 ? "PARTIAL_FAILED" : "TRANSFORMED"
            }
        });
    }
    console.log(`[TRANSFORM COMPLETE] Finished report data transformation for reportCode: ${input.reportCode ?? "all"}. Transformed: ${totalTransformed}, Failed: ${totalFailed}`);
    return {
        transformed: totalTransformed,
        failed: totalFailed
    };
}
//# sourceMappingURL=transform-staged-report-data.job.js.map