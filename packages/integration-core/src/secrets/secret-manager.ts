import { IntegrationError } from "../errors/integration-error.js";
import type { SecretProvider } from "./secret-provider.js";

export class SecretManager {
  private readonly providers = new Map<string, SecretProvider>();

  registerProvider(prefix: string, provider: SecretProvider): void {
    this.providers.set(prefix, provider);
  }

  async getSecret(ref: string): Promise<string> {
    for (const [prefix, provider] of this.providers.entries()) {
      if (ref.startsWith(prefix)) {
        return provider.getSecret(ref);
      }
    }

    throw new IntegrationError({
      message: `Unsupported secret reference: ${ref}`,
      code: "UNSUPPORTED_SECRET_PROVIDER",
      category: "CONFIGURATION_ERROR",
      retryable: false,
      severity: "ERROR",
      context: { ref }
    });
  }
}