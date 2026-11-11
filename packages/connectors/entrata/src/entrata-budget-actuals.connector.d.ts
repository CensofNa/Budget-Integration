import { BaseEntrataConnector } from "./core/base-entrata.connector.js";
import type { EntrataConnectionConfig, EntrataCredentials } from "./core/entrata-types.js";
export interface EntrataBudgetActualRequestOptions {
    requestId?: string;
    propertyId: string;
    glTreeId: string;
    budgetId: string;
    postMonthFrom: string;
    postMonthTo: string;
    glBookTypeIds?: string;
    budgetStatusTypeId?: number;
    accountingMethod: string;
    timeoutMs?: number;
    maxRetries?: number;
    retryBaseDelayMs?: number;
}
export declare class EntrataBudgetActualsConnector extends BaseEntrataConnector {
    constructor(config: EntrataConnectionConfig, credentials: EntrataCredentials);
    fetchBudgetActuals(options: EntrataBudgetActualRequestOptions): Promise<unknown>;
}
//# sourceMappingURL=entrata-budget-actuals.connector.d.ts.map