import { prisma } from "@budget-integration/database";
import { PgBossWorker as Worker, QueueNames } from "@budget-integration/integration-core";
import { transformStagedReportDataJob } from "../jobs/transform-staged-report-data.job.js";
export const transformReportDataStagingWorker = new Worker(QueueNames.TransformReportDataStaging, async (job) => {
    try {
        return await transformStagedReportDataJob({
            companyId: job.data.companyId,
            organisationId: job.data.organisationId,
            integrationSourceId: job.data.integrationSourceId,
            syncRunId: job.data.syncRunId,
            reportRunId: job.data.reportRunId,
            reportCode: job.data.reportCode,
            batchSize: job.data.batchSize ?? 100
        });
    }
    catch (error) {
        // await logIntegrationError(
        //   prisma,
        //   {
        //     companyId: job.data.companyId,
        //     organisationId: job.data.organisationId,
        //     integrationSourceId: job.data.integrationSourceId,
        //     syncRunId: job.data.syncRunId,
        //     entityName: "ReportData",
        //     queueName: QueueNames.TransformReportDataStaging,
        //     jobName: job.name,
        //     bullJobId: String(job.id),
        //     contextJson: {
        //       reportRunId: job.data.reportRunId,
        //       reportCode: job.data.reportCode
        //     }
        //   },
        //   error
        // );
        throw error;
    }
}, {
    concurrency: 2
});
//# sourceMappingURL=transform-report-data-staging.processor.js.map