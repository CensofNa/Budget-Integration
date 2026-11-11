import { BaseEntrataConnector } from "./core/base-entrata.connector.js";
import type { EntrataConnectionConfig, EntrataCredentials } from "./core/entrata-types.js";
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
export declare class EntrataReportsConnector extends BaseEntrataConnector {
    constructor(config: EntrataConnectionConfig, credentials: EntrataCredentials);
    fetchReportData(options: FetchEntrataReportDataOptions): Promise<unknown>;
}
//# sourceMappingURL=entrata-reports.connector.d.ts.map