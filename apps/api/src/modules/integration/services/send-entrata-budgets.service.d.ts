import type { SendBudgetRequestDto, UpdateBudgetRequestDto, SendBudgetResponse } from "../dto/send-budget-request.dto.js";
export declare const MASKED_ENTRATA_PROPERTY_ID = "100141352";
export declare const MASKED_ENTRATA_PROPERTY_NAME = "Livano Cary (past)";
export declare class SendEntrataBudgetsService {
    private readonly logger;
    execute(dto: SendBudgetRequestDto): Promise<SendBudgetResponse>;
    executeUpdate(dto: UpdateBudgetRequestDto): Promise<SendBudgetResponse>;
    private executeMode;
    private fetchAndStoreEntrataBudgetId;
}
//# sourceMappingURL=send-entrata-budgets.service.d.ts.map