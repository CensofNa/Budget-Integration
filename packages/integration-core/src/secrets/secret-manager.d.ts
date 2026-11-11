import type { SecretProvider } from "./secret-provider.js";
export declare class SecretManager {
    private readonly providers;
    registerProvider(prefix: string, provider: SecretProvider): void;
    getSecret(ref: string): Promise<string>;
}
//# sourceMappingURL=secret-manager.d.ts.map