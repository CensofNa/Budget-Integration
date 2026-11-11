import { PgBossWorker as Worker, QueueNames } from "@budget-integration/integration-core";
import { projectOccupancyFromReportsJob } from "../jobs/project-occupancy-from-reports.job.js";
export const projectOccupancyFromReportsWorker = new Worker(QueueNames.ProjectOccupancyFromReports, async (job) => {
    if (job.name !== "project-occupancy-from-reports") {
        return;
    }
    return projectOccupancyFromReportsJob(job.data);
}, {
    concurrency: 2
});
//# sourceMappingURL=project-occupancy-from-reports.processor.js.map