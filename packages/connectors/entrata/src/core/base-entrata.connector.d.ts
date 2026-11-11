import type { EntrataConnectionConfig, EntrataCredentials, EntrataRequestOptions } from "./entrata-types.js";
export declare abstract class BaseEntrataConnector {
    protected readonly config: EntrataConnectionConfig;
    protected readonly credentials: EntrataCredentials;
    protected constructor(config: EntrataConnectionConfig, credentials: EntrataCredentials);
    protected makeRequest<T = unknown>(options: EntrataRequestOptions): Promise<T>;
}
//# sourceMappingURL=base-entrata.connector.d.ts.map