export declare class SendBudgetRequestDto {
    propertyId: string;
    fiscalYear?: number;
    companyId?: string;
    organisationId?: string;
    integrationSourceId?: string;
    dryRun?: boolean;
    applyLatestChangeset?: boolean;
    budgetName?: string;
}
export declare class UpdateBudgetRequestDto extends SendBudgetRequestDto {
    budgetId?: string;
}
export interface SendBudgetResponse {
    success: boolean;
    dryRun?: boolean;
    message: string;
    property: {
        id: string;
        propertyCode: string;
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