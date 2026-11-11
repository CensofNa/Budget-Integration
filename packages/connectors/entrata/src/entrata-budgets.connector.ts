import { BaseEntrataConnector } from "./core/base-entrata.connector.js";
import type {
  EntrataConnectionConfig,
  EntrataCredentials
} from "./core/entrata-types.js";

export interface FetchEntrataBudgetsOptions {
  requestId: string;
  propertyIds: string;
  fiscalYears: string;
  budgetIds?: string;
  budgetStatusTypeIds?: string;
}

export class EntrataBudgetConnector extends BaseEntrataConnector {
  constructor(
    config: EntrataConnectionConfig,
    credentials: EntrataCredentials
  ) {
    super(config, credentials);
  }

  async fetchBudgets(options: FetchEntrataBudgetsOptions): Promise<unknown> {
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