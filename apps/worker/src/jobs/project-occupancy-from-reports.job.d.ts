export interface ProjectOccupancyFromReportsInput {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    propertyId: string;
    budgetYear: number;
}
export declare function projectOccupancyFromReportsJob(input: ProjectOccupancyFromReportsInput): Promise<{
    projectedRows: number;
    skippedRows: number;
    totalMasterRows: number;
}>;
//# sourceMappingURL=project-occupancy-from-reports.job.d.ts.map