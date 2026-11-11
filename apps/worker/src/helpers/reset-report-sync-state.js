import { prisma } from "@budget-integration/database";
import { syncReportDataQueue, transformReportDataStagingQueue, projectOccupancyFromReportsQueue, } from "@budget-integration/integration-core";
/**
 * Clears a BullMQ queue safely before starting a fresh manual sync.
 *
 * This should be called before queuing the new sync job.
 * Do not call this from inside the processor that is currently handling the same queue.
 */
async function resetBullQueue(queue, queueName) {
    console.log(`Resetting BullMQ queue: ${queueName}`);
    await queue.pause();
    await queue.drain(true);
    const states = [
        "wait",
        "delayed",
        "failed",
        "completed",
        "paused",
        "prioritized",
    ];
    for (const state of states) {
        try {
            const jobs = await queue.clean(0, 10000, state);
            console.log(`Cleaned ${jobs.length} jobs from ${queueName}:${state}`);
        }
        catch (error) {
            console.warn(`Could not clean ${queueName}:${state}`, error);
        }
    }
    await queue.resume();
    console.log(`BullMQ queue reset completed: ${queueName}`);
}
/**
 * Resets report sync state before starting a new manual report sync.
 *
 * Clears:
 * 1. BullMQ Redis report queues.
 * 2. PostgreSQL staging_report_data rows.
 * 3. Optionally canonical report tables.
 */
export async function resetReportSyncState(input) {
    const reportCodes = input.reportCodes && input.reportCodes.length > 0
        ? input.reportCodes
        : ["box_score", "resident_retention"];
    console.log("Resetting report sync state.", {
        reportCodes,
        propertyCodes: input.propertyCodes,
        clearAllStaging: input.clearAllStaging ?? false,
        clearCanonicalReportData: input.clearCanonicalReportData ?? false,
    });
    /**
     * 1. Clear Redis/BullMQ queues.
     *
     * This prevents old pending sync/transform/projection jobs from running
     * together with the new manual sync.
     */
    await resetBullQueue(syncReportDataQueue, "sync-report-data-queue");
    await resetBullQueue(transformReportDataStagingQueue, "transform-report-data-staging-queue");
    await resetBullQueue(projectOccupancyFromReportsQueue, "project-occupancy-from-reports-queue");
    /**
     * 2. Clear PostgreSQL staging rows.
     *
     * By default, delete only unfinished rows.
     * If clearAllStaging = true, delete all selected staging rows.
     */
    const stagingWhere = {
        companyId: input.companyId,
        organisationId: input.organisationId,
        integrationSourceId: input.integrationSourceId,
        reportCode: {
            in: reportCodes,
        },
    };
    if (input.propertyCodes && input.propertyCodes.length > 0) {
        stagingWhere.propertyCode = {
            in: input.propertyCodes,
        };
    }
    if (!input.clearAllStaging) {
        stagingWhere.transformStatus = {
            in: ["PENDING", "FAILED", "QUEUED", "STAGED"],
        };
    }
    const deletedStaging = await prisma.stagingReportData.deleteMany({
        where: stagingWhere,
    });
    console.log("Deleted staging_report_data rows.", {
        count: deletedStaging.count,
    });
    /**
     * 3. Optional: clear canonical transformed report data.
     *
     * Use this only for a full clean re-sync.
     */
    if (input.clearCanonicalReportData) {
        const canonicalWhere = {
            companyId: input.companyId,
            organisationId: input.organisationId,
        };
        if (input.propertyCodes && input.propertyCodes.length > 0) {
            canonicalWhere.propertyCode = {
                in: input.propertyCodes,
            };
        }
        if (reportCodes.includes("box_score")) {
            const deletedBoxScoreMonthly = await prisma.propertyBoxScoreMonthly.deleteMany({
                where: canonicalWhere,
            });
            const deletedBoxScoreUnitType = await prisma.propertyBoxScoreUnitTypeMonthly.deleteMany({
                where: canonicalWhere,
            });
            console.log("Deleted Box Score canonical rows.", {
                propertyBoxScoreMonthly: deletedBoxScoreMonthly.count,
                propertyBoxScoreUnitTypeMonthly: deletedBoxScoreUnitType.count,
            });
        }
        if (reportCodes.includes("resident_retention")) {
            const deletedResidentRetention = await prisma.propertyResidentRetentionMonthly.deleteMany({
                where: canonicalWhere,
            });
            console.log("Deleted Resident Retention canonical rows.", {
                propertyResidentRetentionMonthly: deletedResidentRetention.count,
            });
        }
    }
    console.log("Report sync state reset completed.");
}
//# sourceMappingURL=reset-report-sync-state.js.map