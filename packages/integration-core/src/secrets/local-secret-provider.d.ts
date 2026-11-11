import type { SecretProvider } from "./secret-provider.js";
export declare class LocalSecretProvider implements SecretProvider {
    getSecret(ref: string): Promise<string>;
}
//# sourceMappingURL=local-secret-provider.d.ts.map