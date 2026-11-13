export declare class SyncBalanceSheetActualsRequestDto {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    fiscalYear?: number;
    propertyIds?: string[];
    propertyCodes?: string[];
    ownerFilter?: "all" | "livano" | "non-livano";
    glTreeId?: string;
    glBookIds?: number[];
    accountingMethod?: "accrual" | "cash";
    trailingPeriods?: number;
    autoStage?: boolean;
    autoTransform?: boolean;
    autoProject?: boolean;
    runSynchronously?: boolean;
    syncMode?: "SYNC" | "QUEUE" | "STREAM";
    stream?: boolean;
}
//# sourceMappingURL=sync-balance-sheet-actuals-request.dto.d.ts.map