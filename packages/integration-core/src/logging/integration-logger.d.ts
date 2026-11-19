import type { PrismaClient } from "@prisma/client";
export type LogLevel = "INFO" | "WARN" | "ERROR";
export interface IntegrationLogContext {
    service?: string | undefined;
    companyId?: string | null | undefined;
    organisationId?: string | null | undefined;
    integrationSourceId?: string | null | undefined;
    syncRunId?: string | null | undefined;
    jobId?: string | null | undefined;
    queueName?: string | null | undefined;
    entityName?: string | null | undefined;
    action?: string | null | undefined;
    contextJson?: Record<string, unknown> | unknown | undefined;
    errorStack?: string | null | undefined;
}
export interface PaginatedLogsQuery {
    page?: number | undefined;
    limit?: number | undefined;
    service?: string | undefined;
    level?: LogLevel | undefined;
    entityName?: string | undefined;
    action?: string | undefined;
    companyId?: string | undefined;
    syncRunId?: string | undefined;
    search?: string | undefined;
    startDate?: string | Date | undefined;
    endDate?: string | Date | undefined;
}
export interface PaginatedLogsResult<T = any> {
    data: T[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
    };
}
/**
 * Log an INFO message to console and database.
 */
export declare function logInfo(prisma: PrismaClient, service: string, message: string, context?: IntegrationLogContext): Promise<void>;
/**
 * Log a WARNING message to console and database.
 */
export declare function logWarn(prisma: PrismaClient, service: string, message: string, context?: IntegrationLogContext): Promise<void>;
/**
 * Log an ERROR message to console and database.
 */
export declare function logError(prisma: PrismaClient, service: string, message: string, error?: unknown, context?: IntegrationLogContext): Promise<void>;
/**
 * Convenience logger factory bound to a specific service and Prisma client.
 */
export declare function createLogger(service: string, prisma: PrismaClient): {
    service: string;
    info: (message: string, context?: IntegrationLogContext) => Promise<void>;
    warn: (message: string, context?: IntegrationLogContext) => Promise<void>;
    error: (message: string, error?: unknown, context?: IntegrationLogContext) => Promise<void>;
};
/**
 * Fetch paginated integration logs from the database.
 */
export declare function getPaginatedLogs(prisma: PrismaClient, query: PaginatedLogsQuery): Promise<PaginatedLogsResult>;
//# sourceMappingURL=integration-logger.d.ts.map