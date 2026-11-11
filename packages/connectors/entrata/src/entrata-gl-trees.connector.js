import { BaseEntrataConnector } from "./core/base-entrata.connector.js";
export class EntrataGlTreesConnector extends BaseEntrataConnector {
    constructor(config, credentials) {
        super(config, credentials);
    }
    async fetchGlTrees(options) {
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
//# sourceMappingURL=entrata-gl-trees.connector.js.map