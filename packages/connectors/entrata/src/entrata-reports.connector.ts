import { BaseEntrataConnector } from "./core/base-entrata.connector.js";
import type {
  EntrataConnectionConfig,
  EntrataCredentials
} from "./core/entrata-types.js";

export interface FetchEntrataReportDataOptions {
  requestId: string;
  reportName: string;
  reportVersion?: string | undefined;
  methodVersion?: string | undefined;
  filters: Record<string, unknown>;

  timeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
}

export class EntrataReportsConnector extends BaseEntrataConnector {
  constructor(
    config: EntrataConnectionConfig,
    credentials: EntrataCredentials
  ) {
    super(config, credentials);
  }

  async fetchReportData(
    options: FetchEntrataReportDataOptions
  ): Promise<unknown> {
    return this.makeRequest({
      endpointPath: "reports",
      methodName: "getReportData",
      methodVersion: options.methodVersion ?? "r2",
      requestId: options.requestId,
      timeoutMs: options.timeoutMs ?? (options.reportName === "balance_sheet" ? 120000 : 30000),
      maxRetries: options.maxRetries ?? 3,
      retryBaseDelayMs: options.retryBaseDelayMs ?? 60000,
      params: {
        reportName: options.reportName,
        reportVersion: options.reportVersion,
        filters: options.filters
      }
    });
  }
}