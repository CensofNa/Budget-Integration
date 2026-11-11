import crypto from "node:crypto";
function normalizeForHash(value) {
    if (Array.isArray(value)) {
        return value.map(normalizeForHash);
    }
    if (value && typeof value === "object") {
        return Object.keys(value)
            .sort()
            .reduce((result, key) => {
            result[key] = normalizeForHash(value[key]);
            return result;
        }, {});
    }
    return value;
}
export function createSourceHash(value) {
    const normalized = normalizeForHash(value);
    const json = JSON.stringify(normalized);
    return crypto.createHash("sha256").update(json).digest("hex");
}
//# sourceMappingURL=hash.js.map