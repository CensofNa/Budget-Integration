import { BaseEntrataConnector } from "./core/base-entrata.connector.js";
import type { EntrataConnectionConfig, EntrataCredentials } from "./core/entrata-types.js";
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
export declare class EntrataGlTreesConnector extends BaseEntrataConnector {
    constructor(config: EntrataConnectionConfig, credentials: EntrataCredentials);
    fetchGlTrees(options: FetchEntrataGlTreesOptions): Promise<unknown>;
}
//# sourceMappingURL=entrata-gl-trees.connector.d.ts.map