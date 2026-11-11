import { PgBossWorker as Worker } from "@budget-integration/integration-core";
interface ProjectOccupancyJobData {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    propertyId: string;
    budgetYear: number;
}
export declare const projectOccupancyFromReportsWorker: Worker<ProjectOccupancyJobData>;
export {};
//# sourceMappingURL=project-occupancy-from-reports.processor.d.ts.map