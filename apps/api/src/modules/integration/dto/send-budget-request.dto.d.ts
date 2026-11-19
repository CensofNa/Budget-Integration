export declare class SendBudgetRequestDto {
    propertyId: string;
    fiscalYear?: number;
    companyId?: string;
    organisationId?: string;
    integrationSourceId?: string;
    dryRun?: boolean;
    applyLatestChangeset?: boolean;
    budgetName?: string;
    budgetScope?: "OPERATING" | "CAPEX" | "ALL";
}
export declare class UpdateBudgetRequestDto extends SendBudgetRequestDto {
    budgetId?: string;
}
export interface SendBudgetResponse {
    success: boolean;
    operation?: "CREATE" | "UPDATE";
    dryRun?: boolean;
    message: string;
    budgetScope?: "OPERATING" | "CAPEX" | "ALL" | string;
    property: {
        id: string;
        propertyCode: string;
        propertyName: string;
    };
    targetEntrataProperty?: {
        propertyId: string;
        propertyName: string;
    };
    maskedEntrataProperty?: {
        propertyId: string;
        propertyName: string;
    };
    fiscalYear: number;
    requestId?: string;
    budgetId?: string;
    budgetName?: string;
    propertyName?: string;
    glAccountsCount?: number;
    endpointUrl: string;
    syncRunId?: string;
    stagingBatchId?: string;
    statusCode?: number;
    entrataResponse?: unknown;
    generatedPayload?: unknown;
    changesetApplied?: unknown;
}
//# sourceMappingURL=send-budget-request.dto.d.ts.map