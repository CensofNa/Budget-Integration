import { BaseEntrataConnector } from "./core/base-entrata.connector.js";
export class EntrataReportsConnector extends BaseEntrataConnector {
    constructor(config, credentials) {
        super(config, credentials);
    }
    async fetchReportData(options) {
        return this.makeRequest({
            endpointPath: "reports",
            methodName: "getReportData",
            methodVersion: options.methodVersion ?? "r2",
            requestId: options.requestId,
            timeoutMs: options.timeoutMs ?? 30000,
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
//# sourceMappingURL=entrata-reports.connector.js.map