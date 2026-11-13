export declare class StageBalanceSheetActualsRequestDto {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    syncRunId: string;
    reportLogId?: string;
    autoTransform?: boolean;
    autoProject?: boolean;
}
export declare class TransformBalanceSheetActualsRequestDto {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    syncRunId: string;
    autoProject?: boolean;
}
export declare class ProjectBalanceSheetActualsRequestDto {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    syncRunId?: string;
    propertyId?: string;
    fiscalYear?: number;
}
//# sourceMappingURL=balance-sheet-actuals-pipeline-request.dto.d.ts.map