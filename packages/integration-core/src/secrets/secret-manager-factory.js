import { SecretManager } from "./secret-manager.js";
import { LocalSecretProvider } from "./local-secret-provider.js";
let singleton = null;
export function getSecretManager() {
    if (singleton) {
        return singleton;
    }
    const manager = new SecretManager();
    manager.registerProvider("env://", new LocalSecretProvider());
    singleton = manager;
    return manager;
}
//# sourceMappingURL=secret-manager-factory.js.map