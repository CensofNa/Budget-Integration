import type { AxiosRequestConfig } from "axios";
export interface EntrataRequestOptions {
    rateLimitKey: string;
    minDelayMs?: number;
    maxRetries?: number;
    retryBaseDelayMs?: number;
    axiosConfig: AxiosRequestConfig;
}
export declare function entrataRequest<T = unknown>(options: EntrataRequestOptions): Promise<T>;
//# sourceMappingURL=entrata-http-client.d.ts.map