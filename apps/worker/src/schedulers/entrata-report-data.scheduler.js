import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";
import { QueueNames, syncReportDataQueue } from "@budget-integration/integration-core";
function getSchedulePattern(syncSettingsJson) {
    if (syncSettingsJson &&
        typeof syncSettingsJson === "object" &&
        !Array.isArray(syncSettingsJson)) {
        const value = syncSettingsJson.schedule;
        if (typeof value === "string" && value.trim().length > 0) {
            return value;
        }
    }
    return null;
}
export async function registerEntrataReportDataSchedulers() {
    const reports = await prisma.integrationReportDefinition.findMany({
        where: {
            isEnabled: true,
            integrationSource: {
                sourceType: "entrata",
                isActive: true
            }
        },
        include: {
            integrationSource: true
        }
    });
    for (const report of reports) {
        const cronPattern = getSchedulePattern(report.syncSettingsJson);
        if (!cronPattern)
            continue;
        const schedulerId = `sync-entrata-report-${report.reportCode}-${report.companyId}-${report.organisationId}-${report.integrationSourceId}`;
        await syncReportDataQueue.upsertJobScheduler(schedulerId, {
            pattern: cronPattern
        }, {
            name: "sync-entrata-report-data",
            data: {
                companyId: report.companyId,
                organisationId: report.organisationId,
                integrationSourceId: report.integrationSourceId,
                entityName: "ReportData",
                reportCode: report.reportCode
            },
            opts: {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 5000
                },
                removeOnComplete: 100,
                removeOnFail: 1000
            }
        });
        console.log(`Registered ReportData scheduler: ${schedulerId}, Report: ${report.reportCode}, Cron: ${cronPattern}`);
    }
}
//# sourceMappingURL=entrata-report-data.scheduler.js.map