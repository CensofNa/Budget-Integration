export interface EntrataRateLimitOptions {
    key: string;
    minDelayMs: number;
}
export declare function runWithEntrataRateLimit<T>(options: EntrataRateLimitOptions, action: () => Promise<T>): Promise<T>;
//# sourceMappingURL=entrata-rate-limit.d.ts.map