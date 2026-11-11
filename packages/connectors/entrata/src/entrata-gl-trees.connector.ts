import { BaseEntrataConnector } from "./core/base-entrata.connector.js";
import type {
  EntrataConnectionConfig,
  EntrataCredentials
} from "./core/entrata-types.js";

export interface FetchEntrataGlTreesOptions {
  requestId: string;

  glTreeId?: string | undefined;
  glBranchId?: string | undefined;
  glGroupTypeId?: number | string | undefined;
  glTreeTypeId?: number | string | undefined;
  accountNumbers?: string | undefined;

  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
}

export class EntrataGlTreesConnector extends BaseEntrataConnector {
  constructor(
    config: EntrataConnectionConfig,
    credentials: EntrataCredentials
  ) {
    super(config, credentials);
  }

  async fetchGlTrees(
    options: FetchEntrataGlTreesOptions
  ): Promise<unknown> {
    return this.makeRequest({
      endpointPath: "financial",
      methodName: "getGlTrees",
      methodVersion: "r2",
      requestId: options.requestId,
      params: {
        glTreeId: options.glTreeId ?? "",
        glBranchId: options.glBranchId ?? "",
        glGroupTypeId: options.glGroupTypeId ?? "",
        glTreeTypeId: options.glTreeTypeId ?? "",
        accountNumbers: options.accountNumbers ?? ""
      },
      timeoutMs: options.timeoutMs ?? 60000,
      maxRetries: options.maxRetries ?? 2,
      retryBaseDelayMs: options.retryBaseDelayMs ?? 60000
    });
  }
}