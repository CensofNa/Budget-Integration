import { BaseEntrataConnector } from "./core/base-entrata.connector.js";
import type { EntrataConnectionConfig, EntrataCredentials } from "./core/entrata-types.js";
export interface FetchEntrataBudgetsOptions {
    requestId: string;
    propertyIds: string;
    fiscalYears: string;
    budgetIds?: string;
    budgetStatusTypeIds?: string;
}
export declare class EntrataBudgetConnector extends BaseEntrataConnector {
    constructor(config: EntrataConnectionConfig, credentials: EntrataCredentials);
    fetchBudgets(options: FetchEntrataBudgetsOptions): Promise<unknown>;
}
//# sourceMappingURL=entrata-budgets.connector.d.ts.map