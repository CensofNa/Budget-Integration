import { IntegrationError } from "../errors/integration-error.js";
export class SecretManager {
    providers = new Map();
    registerProvider(prefix, provider) {
        this.providers.set(prefix, provider);
    }
    async getSecret(ref) {
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
//# sourceMappingURL=secret-manager.js.map