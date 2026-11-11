import type { PrismaClient } from "@prisma/client";
export type LogLevel = "INFO" | "WARN" | "ERROR";
export interface IntegrationLogContext {
    companyId?: string;
    organisationId?: string;
    integrationSourceId?: string;
    syncRunId?: string;
    entityName?: string;
    queueName?: string;
    jobName?: string;
    bullJobId?: string;
    contextJson?: unknown;
}
export declare function logInfo(message: string, context?: unknown): void;
export declare function logWarn(message: string, context?: unknown): void;
export declare function logError(prisma: PrismaClient, message: string, error: unknown, context: IntegrationLogContext): Promise<void>;
//# sourceMappingURL=integration-logger.d.ts.map