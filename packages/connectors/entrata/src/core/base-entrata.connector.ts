import { entrataRequest } from "../entrata-http-client.js";
import type {
  EntrataConnectionConfig,
  EntrataCredentials,
  EntrataRequestOptions
} from "./entrata-types.js";

// Base connector class for interacting with Entrata API
// Provides common functionality for making authenticated requests to Entrata
// Specific entity connectors (e.g. PropertyConnector, BudgetConnector) will extend this base class
// and implement entity-specific methods that utilize the makeRequest method defined here
export abstract class BaseEntrataConnector {
  protected constructor(
    protected readonly config: EntrataConnectionConfig,
    protected readonly credentials: EntrataCredentials
  ) { }

  // Core method for making requests to Entrata API
  // Handles authentication, rate limiting, retries, and error handling
  protected async makeRequest<T = unknown>(
    options: EntrataRequestOptions
  ): Promise<T> {
    const requestId =
      options.requestId ??
      `entrata-${options.methodName}-${Date.now()}`;

    const method: Record<string, unknown> = {
      name: options.methodName,
      params: options.params
    };

    if (options.methodVersion) {
      method.version = options.methodVersion;
    }

    const requestPayload = {
      auth: {
        type: "apikey"
      },
      requestId,
      method
    };

    // if (process.env.NODE_ENV !== "production") {
    //   console.log(
    //     "[Entrata] Request JSON:",
    //     JSON.stringify(requestPayload, null, 2)
    //   );
    // }

    // Construct the rate limit key using orgSlug, endpointPath, and methodName
    // This allows for granular rate limiting based on the specific API method being called
    // If options.rateLimitKey is provided, it will be used instead of the default construction
    // The entrataRequest function will handle the actual HTTP request, including retries and rate limiting
    return entrataRequest<T>({
      rateLimitKey:
        options.rateLimitKey ??
        `${this.config.orgSlug}:${options.endpointPath}:${options.methodName}`,
      minDelayMs: this.config.minDelayMs ?? 1200,
      maxRetries: options.maxRetries ?? 3,
      retryBaseDelayMs: options.retryBaseDelayMs ?? 60000,
      axiosConfig: {
        method: "POST",
        url: `${this.config.baseUrl}/ext/orgs/${this.config.orgSlug}/v1/${options.endpointPath}`,

        data: requestPayload,
        // data: {
        //   auth: {
        //     type: "apikey"
        //   },
        //   requestId,
        //   method
        // },
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": this.credentials.apiKey
        },
        timeout: options.timeoutMs ?? 30000
      }
    });
  }
}