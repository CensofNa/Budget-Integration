export type IntegrationErrorCategory = "API_ERROR" | "AUTH_ERROR" | "RATE_LIMIT_ERROR" | "VALIDATION_ERROR" | "TRANSFORM_ERROR" | "DATABASE_ERROR" | "QUEUE_ERROR" | "CONFIGURATION_ERROR" | "UNKNOWN_ERROR";
export type IntegrationErrorSeverity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";
export declare class IntegrationError extends Error {
    readonly code: string;
    readonly category: IntegrationErrorCategory;
    readonly severity: IntegrationErrorSeverity;
    readonly retryable: boolean;
    readonly context: Record<string, unknown> | undefined;
    constructor(options: {
        message: string;
        code: string;
        category: IntegrationErrorCategory;
        retryable?: boolean;
        severity?: IntegrationErrorSeverity;
        context?: Record<string, unknown>;
        cause?: unknown;
    });
}
//# sourceMappingURL=integration-error.d.ts.map