import { BaseEntrataConnector } from "./core/base-entrata.connector.js";
export class EntrataBudgetActualsConnector extends BaseEntrataConnector {
    constructor(config, credentials) {
        super(config, credentials);
    }
    async fetchBudgetActuals(options) {
        return this.makeRequest({
            endpointPath: "financial",
            methodName: "getBudgetActuals",
            methodVersion: "r1",
            ...(options.requestId ? { requestId: options.requestId } : {}),
            timeoutMs: options.timeoutMs ?? 30000,
            maxRetries: options.maxRetries ?? 3,
            retryBaseDelayMs: options.retryBaseDelayMs ?? 60000,
            params: {
                propertyId: options.propertyId,
                glTreeId: options.glTreeId,
                budgetId: options.budgetId,
                postMonthFrom: options.postMonthFrom,
                postMonthTo: options.postMonthTo,
                glBookTypeIds: options.glBookTypeIds ?? "",
                budgetStatusTypeId: options.budgetStatusTypeId ?? 1,
                accountingMethod: options.accountingMethod
            }
        });
    }
}
//# sourceMappingURL=entrata-budget-actuals.connector.js.map