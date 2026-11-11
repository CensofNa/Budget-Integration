import { IntegrationError } from "../errors/integration-error.js";
import type { SecretProvider } from "./secret-provider.js";

export class LocalSecretProvider implements SecretProvider {
  async getSecret(ref: string): Promise<string> {
    const key = ref.replace("env://", "");
    const value = process.env[key];

    if (!value) {
      throw new IntegrationError({
        message: `Secret not found for reference: ${ref}`,
        code: "SECRET_NOT_FOUND",
        category: "CONFIGURATION_ERROR",
        retryable: false,
        severity: "ERROR",
        context: { ref }
      });
    }

    return value;
  }
}