import { Prisma } from "@prisma/client";
export function asObject(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
}
export function asArray(value) {
    if (!value)
        return [];
    if (Array.isArray(value))
        return value.map(asObject);
    return [asObject(value)];
}
export function getStringArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item) => getString(item))
        .filter((item) => !!item);
}
export function getString(value) {
    if (value === null || value === undefined)
        return undefined;
    const result = String(value).trim();
    return result.length > 0 ? result : undefined;
}
export function getStringOrNull(value) {
    return getString(value) ?? null;
}
export function getDecimal(value) {
    if (value === null || value === undefined || value === "")
        return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? new Prisma.Decimal(parsed) : null;
}
export function getBoolean(value) {
    return value === true || value === 1 || value === "1" || value === "true";
}
// export function nullableBoolean(value: unknown): boolean | null {
//   if (value === null || value === undefined || value === "") return null;
//   return getBoolean(value);
// }
export function getNumberFromJson(value, defaultValue) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}
export function getInt(value) {
    if (value === null || value === undefined || value === "")
        return null;
    const parsed = Number.parseInt(String(value), 10);
    return Number.isNaN(parsed) ? null : parsed;
}
export function parseDate(value) {
    const raw = getStringOrNull(value);
    if (!raw)
        return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}
// export function getInt(value: unknown): number | undefined  {
//   if (value === null || value === undefined || value === "") return undefined;
//   const parsed = Number.parseInt(String(value), 10);
//   return Number.isNaN(parsed) ? undefined : parsed;
// }
// export function nullableInt(value: unknown): number | null {
//   return getInt(value) ?? null;
// }
// export function nullableNumber(value: unknown): number | null {
//   if (value === null || value === undefined || value === "") {
//     return null;
//   }
//   const cleaned = String(value)
//     .replace(/,/g, "")
//     .trim();
//   if (!cleaned) {
//     return null;
//   }
//   const parsed = Number(cleaned);
//   return Number.isFinite(parsed)
//     ? parsed
//     : null;
// }
export function getCredentialValue(credentialsJson, key) {
    const credentials = asObject(credentialsJson);
    const value = credentials[key];
    return typeof value === "string" && value.trim().length > 0
        ? value
        : undefined;
}
export function chunkArray(items, size) {
    const safeSize = Math.max(1, size);
    const chunks = [];
    for (let index = 0; index < items.length; index += safeSize) {
        chunks.push(items.slice(index, index + safeSize));
    }
    return chunks;
}
//# sourceMappingURL=object-utils.js.map