import { SecretManager } from "./secret-manager.js";
import { LocalSecretProvider } from "./local-secret-provider.js";

let singleton: SecretManager | null = null;

export function getSecretManager(): SecretManager {
  if (singleton) {
    return singleton;
  }

  const manager = new SecretManager();

  manager.registerProvider("env://", new LocalSecretProvider());

  singleton = manager;

  return manager;
}