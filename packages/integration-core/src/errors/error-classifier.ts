import { IntegrationError } from "./integration-error.js";

export function classifyIntegrationError(error: unknown): IntegrationError {
  if (error instanceof IntegrationError) {
    return error;
  }

  if (error instanceof Error) {
    return new IntegrationError({
      message: error.message,
      code: "UNKNOWN_ERROR",
      category: "UNKNOWN_ERROR",
      retryable: false,
      severity: "ERROR",
      cause: error
    });
  }

  return new IntegrationError({
    message: String(error),
    code: "UNKNOWN_ERROR",
    category: "UNKNOWN_ERROR",
    retryable: false,
    severity: "ERROR"
  });
}