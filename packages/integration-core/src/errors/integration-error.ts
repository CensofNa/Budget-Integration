export type IntegrationErrorCategory =
  | "API_ERROR"
  | "AUTH_ERROR"
  | "RATE_LIMIT_ERROR"
  | "VALIDATION_ERROR"
  | "TRANSFORM_ERROR"
  | "DATABASE_ERROR"
  | "QUEUE_ERROR"
  | "CONFIGURATION_ERROR"
  | "UNKNOWN_ERROR";

export type IntegrationErrorSeverity =
  | "INFO"
  | "WARNING"
  | "ERROR"
  | "CRITICAL";

export class IntegrationError extends Error {
  public readonly code: string;
  public readonly category: IntegrationErrorCategory;
  public readonly severity: IntegrationErrorSeverity;
  public readonly retryable: boolean;
  public readonly context: Record<string, unknown> | undefined;

  constructor(options: {
    message: string;
    code: string;
    category: IntegrationErrorCategory;
    retryable?: boolean;
    severity?: IntegrationErrorSeverity;
    context?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(options.message);

    this.name = "IntegrationError";
    this.code = options.code;
    this.category = options.category;
    this.retryable = options.retryable ?? false;
    this.severity = options.severity ?? "ERROR";
    this.context = options.context;

    if (options.cause) {
      this.cause = options.cause;
    }
  }
}