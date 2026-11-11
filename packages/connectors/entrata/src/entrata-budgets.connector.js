import { BaseEntrataConnector } from "./core/base-entrata.connector.js";
export class EntrataBudgetConnector extends BaseEntrataConnector {
    constructor(config, credentials) {
        super(config, credentials);
    }
    async fetchBudgets(options) {
        return this.makeRequest({
            endpointPath: "financial",
            methodName: "getBudgets",
            requestId: options.requestId,
            params: {
                propertyIds: options.propertyIds,
                budgetIds: options.budgetIds ?? "",
                budgetStatusTypeIds: options.budgetStatusTypeIds ?? "",
                fiscalYears: options.fiscalYears
            }
        });
    }
}
//# sourceMappingURL=entrata-budgets.connector.js.map