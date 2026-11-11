export interface EntrataConnectionConfig {
    baseUrl: string;
    orgSlug: string;
    minDelayMs?: number;
}
export interface EntrataCredentials {
    apiKey: string;
}
export interface EntrataRequestOptions {
    endpointPath: string;
    methodName: string;
    methodVersion?: string;
    requestId?: string;
    params: Record<string, unknown>;
    rateLimitKey?: string;
    timeoutMs?: number;
    maxRetries?: number;
    retryBaseDelayMs?: number;
}
//# sourceMappingURL=entrata-types.d.ts.map