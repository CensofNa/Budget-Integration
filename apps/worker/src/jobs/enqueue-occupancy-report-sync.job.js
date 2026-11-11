import { syncReportDataQueue, projectOccupancyFromReportsQueue } from "@budget-integration/integration-core";
export async function enqueueOccupancyReportSync(input) {
    await syncReportDataQueue.add("sync-entrata-report-data", {
        companyId: input.companyId,
        organisationId: input.organisationId,
        integrationSourceId: input.integrationSourceId,
        entityName: "ReportData",
        reportCode: "box_score",
        propertyIds: [input.propertyCode],
        fiscalYear: input.budgetYear,
        includePriorYear: input.includePriorYear ?? false
    }, {
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 5000
        },
        removeOnComplete: 100,
        removeOnFail: 1000
    });
    await syncReportDataQueue.add("sync-entrata-report-data", {
        companyId: input.companyId,
        organisationId: input.organisationId,
        integrationSourceId: input.integrationSourceId,
        entityName: "ReportData",
        reportCode: "resident_retention",
        propertyIds: [input.propertyCode],
        fiscalYear: input.budgetYear,
        includePriorYear: input.includePriorYear ?? false
    }, {
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 5000
        },
        removeOnComplete: 100,
        removeOnFail: 1000
    });
    await projectOccupancyFromReportsQueue.add("project-occupancy-from-reports", {
        companyId: input.companyId,
        organisationId: input.organisationId,
        integrationSourceId: input.integrationSourceId,
        entityName: "Occupancy",
        propertyId: input.propertyId,
        budgetYear: input.budgetYear
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
//# sourceMappingURL=enqueue-occupancy-report-sync.job.js.map