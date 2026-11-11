import { IntegrationError } from "../errors/integration-error.js";
export class LocalSecretProvider {
    async getSecret(ref) {
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
//# sourceMappingURL=local-secret-provider.js.map