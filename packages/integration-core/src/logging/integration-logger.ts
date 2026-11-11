import type { PrismaClient, Prisma } from "@prisma/client";

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

function safeJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch {
    return { serialized: String(value) } as Prisma.InputJsonValue;
  }
}

function formatConsoleMessage(
  level: LogLevel,
  service: string,
  message: string,
  context?: IntegrationLogContext
): string {
  const timestamp = new Date().toISOString();
  const contextSummary = context?.action
    ? ` [action=${context.action}${context.entityName ? ` entity=${context.entityName}` : ""}]`
    : "";
  return `[${timestamp}] [${service}] [${level}]${contextSummary} ${message}`;
}

async function persistLogToDatabase(
  prisma: PrismaClient,
  level: LogLevel,
  service: string,
  message: string,
  context?: IntegrationLogContext,
  error?: unknown
): Promise<void> {
  try {
    let errorStack = context?.errorStack;
    if (!errorStack && error) {
      errorStack = error instanceof Error ? error.stack : String(error);
    }

    const jsonVal = safeJson(context?.contextJson);

    const data: Prisma.IntegrationLogCreateInput = {
      service,
      level,
      message,
      ...(context?.companyId ? { companyId: context.companyId } : {}),
      ...(context?.organisationId ? { organisationId: context.organisationId } : {}),
      ...(context?.integrationSourceId ? { integrationSourceId: context.integrationSourceId } : {}),
      ...(context?.syncRunId ? { syncRunId: context.syncRunId } : {}),
      ...(context?.jobId ? { jobId: context.jobId } : {}),
      ...(context?.queueName ? { queueName: context.queueName } : {}),
      ...(context?.entityName ? { entityName: context.entityName } : {}),
      ...(context?.action ? { action: context.action } : {}),
      ...(jsonVal !== undefined ? { contextJson: jsonVal } : {}),
      ...(errorStack ? { errorStack } : {})
    };

    await prisma.integrationLog.create({ data });
  } catch (dbError) {
    // Non-blocking: Logging failure should never crash the host application
    console.error(`[logger-db-fallback] Failed to persist log entry to database:`, dbError);
  }
}

/**
 * Log an INFO message to console and database.
 */
export async function logInfo(
  prisma: PrismaClient,
  service: string,
  message: string,
  context?: IntegrationLogContext
): Promise<void> {
  console.log(formatConsoleMessage("INFO", service, message, context), context?.contextJson ?? "");
  await persistLogToDatabase(prisma, "INFO", service, message, context);
}

/**
 * Log a WARNING message to console and database.
 */
export async function logWarn(
  prisma: PrismaClient,
  service: string,
  message: string,
  context?: IntegrationLogContext
): Promise<void> {
  console.warn(formatConsoleMessage("WARN", service, message, context), context?.contextJson ?? "");
  await persistLogToDatabase(prisma, "WARN", service, message, context);
}

/**
 * Log an ERROR message to console and database.
 */
export async function logError(
  prisma: PrismaClient,
  service: string,
  message: string,
  error?: unknown,
  context?: IntegrationLogContext
): Promise<void> {
  const errorDetails = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error;
  console.error(formatConsoleMessage("ERROR", service, message, context), errorDetails);
  await persistLogToDatabase(prisma, "ERROR", service, message, context, error);
}

/**
 * Convenience logger factory bound to a specific service and Prisma client.
 */
export function createLogger(service: string, prisma: PrismaClient) {
  return {
    service,
    info: (message: string, context?: IntegrationLogContext) =>
      logInfo(prisma, service, message, context),
    warn: (message: string, context?: IntegrationLogContext) =>
      logWarn(prisma, service, message, context),
    error: (message: string, error?: unknown, context?: IntegrationLogContext) =>
      logError(prisma, service, message, error, context)
  };
}

/**
 * Fetch paginated integration logs from the database.
 */
export async function getPaginatedLogs(
  prisma: PrismaClient,
  query: PaginatedLogsQuery
): Promise<PaginatedLogsResult> {
  const page = Math.max(1, Number(query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 20)));
  const skip = (page - 1) * limit;

  const where: Prisma.IntegrationLogWhereInput = {};

  if (query.service) {
    where.service = query.service;
  }
  if (query.level) {
    where.level = query.level;
  }
  if (query.entityName) {
    where.entityName = query.entityName;
  }
  if (query.action) {
    where.action = query.action;
  }
  if (query.companyId) {
    where.companyId = query.companyId;
  }
  if (query.syncRunId) {
    where.syncRunId = query.syncRunId;
  }
  if (query.search) {
    where.message = {
      contains: query.search,
      mode: "insensitive"
    };
  }
  if (query.startDate || query.endDate) {
    where.createdAt = {};
    if (query.startDate) {
      where.createdAt.gte = new Date(query.startDate);
    }
    if (query.endDate) {
      where.createdAt.lte = new Date(query.endDate);
    }
  }

  const [total, data] = await Promise.all([
    prisma.integrationLog.count({ where }),
    prisma.integrationLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit
    })
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    }
  };
}