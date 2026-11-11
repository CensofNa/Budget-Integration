// packages/integration-core/src/errors/integration-error-logger.ts
export {};
// import type { PrismaClient, Prisma } from "@prisma/client";
// export type IntegrationErrorStage =
//   | "EXTERNAL_API"
//   | "STAGING"
//   | "TRANSFORM"
//   | "PROJECTION"
//   | "QUEUE_PROCESSOR"
//   | "DATABASE"
//   | "UNKNOWN";
// export interface LogIntegrationErrorInput {
//   companyId?: string | null;
//   organisationId?: string | null;
//   integrationSourceId?: string | null;
//   syncRunId?: string | null;
//   queueJobId?: string | null;
//   bullJobId?: string | number | null;
//   entityName?: string | null;
//   sourceRecordId?: string | null;
//   stagingRecordId?: string | null;
//   stage: IntegrationErrorStage;
//   operation: string;
//   error: unknown;
//   requestPayload?: Prisma.InputJsonValue;
//   responsePayload?: Prisma.InputJsonValue;
//   context?: Prisma.InputJsonValue;
// }
// export interface NormalizedIntegrationError {
//   name: string;
//   message: string;
//   stack?: string;
//   code?: string;
//   statusCode?: number;
//   details?: unknown;
// }
// export function normalizeIntegrationError(
//   error: unknown
// ): NormalizedIntegrationError {
//   if (error instanceof Error) {
//     const anyError = error as any;
//     return {
//       name: error.name,
//       message: error.message,
//       stack: error.stack,
//       code: anyError.code,
//       statusCode:
//         anyError.statusCode ??
//         anyError.status ??
//         anyError.response?.status,
//       details:
//         anyError.details ??
//         anyError.response?.data ??
//         anyError.cause
//     };
//   }
//   return {
//     name: "UnknownError",
//     message: typeof error === "string" ? error : JSON.stringify(error),
//     details: error
//   };
// }
// export async function logIntegrationError(
//   prisma: PrismaClient,
//   input: LogIntegrationErrorInput
// ): Promise<void> {
//   const normalized = normalizeIntegrationError(input.error);
//   console.error(`[Integration Error] ${input.stage} - ${input.operation}`, {
//     companyId: input.companyId,
//     organisationId: input.organisationId,
//     integrationSourceId: input.integrationSourceId,
//     syncRunId: input.syncRunId,
//     queueJobId: input.queueJobId,
//     bullJobId: input.bullJobId,
//     entityName: input.entityName,
//     sourceRecordId: input.sourceRecordId,
//     stagingRecordId: input.stagingRecordId,
//     error: normalized
//   });
//   try {
//     console.log("Logging integration error...");
//     await prisma.integrationErrorLog.create({
//       data: {
//         companyId: input.companyId ?? undefined,
//         organisationId: input.organisationId ?? undefined,
//         integrationSourceId: input.integrationSourceId ?? undefined,
//         syncRunId: input.syncRunId ?? undefined,
//         queueJobId: input.queueJobId ?? undefined,
//         entityName: input.entityName ?? undefined,
//         sourceRecordId: input.sourceRecordId ?? undefined,
//         stagingRecordId: input.stagingRecordId ?? undefined,
//         stage: input.stage,
//         operation: input.operation,
//         errorName: normalized.name,
//         // errorCode: normalized.code ?? null,
//         errorMessage: normalized.message,
//         errorStack: normalized.stack ?? null,
//         statusCode: normalized.statusCode ?? null,
//         requestPayload: input.requestPayload ?? undefined,
//         responsePayload:
//           input.responsePayload ??
//           safeJson(normalized.details) ??
//           undefined,
//         context: input.context ?? undefined
//       }
//     });
//   } catch (logError) {
//     const logFailure = normalizeIntegrationError(logError);
//     console.error("[Integration Error Logger Failed]", {
//       originalError: normalized,
//       logFailure
//     });
//   }
// }
// function safeJson(value: unknown): Prisma.InputJsonValue | null {
//   if (value === undefined || value === null) return null;
//   try {
//     return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
//   } catch {
//     return {
//       message: "Unable to serialize error details"
//     };
//   }
// }
// import { Prisma } from "@prisma/client";
// import type { PrismaClient } from "@prisma/client";
// import { classifyIntegrationError } from "./error-classifier.js";
// export interface IntegrationErrorLogContext {
//   companyId: string;
//   organisationId: string;
//   integrationSourceId?: string | null;
//   syncRunId?: string | null;
//   entityName?: string;
//   queueName?: string;
//   jobName?: string;
//   bullJobId?: string;
//   contextJson?: Record<string, unknown>;
// }
// export async function logIntegrationError(
//   prisma: PrismaClient,
//   context: IntegrationErrorLogContext,
//   error: unknown
// ): Promise<void> {
//   const classified = classifyIntegrationError(error);
//   await prisma.integrationErrorLog.create({
//     data: {
//       companyId: context.companyId,
//       organisationId: context.organisationId,
//       integrationSourceId: context.integrationSourceId ?? null,
//       syncRunId: context.syncRunId ?? null,
//       entityName: context.entityName ?? null,
//       queueName: context.queueName ?? null,
//       jobName: context.jobName ?? null,
//       bullJobId: context.bullJobId ?? null,
//       errorCode: classified.code,
//       errorMessage: classified.message,
//       errorCategory: classified.category,
//       severity: classified.severity,
//       isRetryable: classified.retryable,
//       contextJson: {
//         ...(context.contextJson ?? {}),
//         ...(classified.context ?? {})
//       } as Prisma.InputJsonValue,
//       stackTrace:
//         classified.stack ??
//         (classified.cause instanceof Error ? classified.cause.stack ?? null : null)
//     }
//   });
// }
//# sourceMappingURL=integration-error-logger.js.map