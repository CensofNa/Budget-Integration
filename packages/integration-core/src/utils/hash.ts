import crypto from "node:crypto";

function normalizeForHash(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeForHash);
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = normalizeForHash((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }

  return value;
}

export function createSourceHash(value: unknown): string {
  const normalized = normalizeForHash(value);
  const json = JSON.stringify(normalized);

  return crypto.createHash("sha256").update(json).digest("hex");
}