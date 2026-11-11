// Types related to Entrata API integration
export interface EntrataConnectionConfig {
  baseUrl: string;
  orgSlug: string;
  minDelayMs?: number;
}

// Credentials needed to authenticate with Entrata API
export interface EntrataCredentials {
  apiKey: string;
}

// Common options for making requests to Entrata API
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