import { BaseEntrataConnector } from "./core/base-entrata.connector.js";

import type {
  EntrataConnectionConfig,
  EntrataCredentials
} from "./core/entrata-types.js";

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

export class EntrataBudgetActualsConnector extends BaseEntrataConnector {
  constructor(config: EntrataConnectionConfig, credentials: EntrataCredentials) {
    super(config, credentials);
  }

  async fetchBudgetActuals(
    options: EntrataBudgetActualRequestOptions
  ): Promise<unknown> {
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