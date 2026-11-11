import { Prisma } from "@prisma/client";

export type JsonObject = Record<string, unknown>;

export function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

export function asArray(value: unknown): JsonObject[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(asObject);
  return [asObject(value)];
}

export function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => getString(item))
    .filter((item): item is string => !!item);
}

export function getString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;

  const result = String(value).trim();
  return result.length > 0 ? result : undefined;
}

export function getStringOrNull(value: unknown): string | null {
  return getString(value) ?? null;
}

export function getDecimal(value: unknown): Prisma.Decimal | null {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? new Prisma.Decimal(parsed) : null;
}

export function getBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

// export function nullableBoolean(value: unknown): boolean | null {
//   if (value === null || value === undefined || value === "") return null;
//   return getBoolean(value);
// }

export function getNumberFromJson(value: unknown, defaultValue: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

export function getInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function parseDate(value: unknown): Date | null {
  const raw = getStringOrNull(value);

  if (!raw) return null;

  // Handle date-only MM/DD/YYYY as UTC midnight to prevent local timezone shifts
  const mdyMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch && mdyMatch[1] && mdyMatch[2] && mdyMatch[3]) {
    const month = Number.parseInt(mdyMatch[1], 10) - 1;
    const day = Number.parseInt(mdyMatch[2], 10);
    const year = Number.parseInt(mdyMatch[3], 10);
    return new Date(Date.UTC(year, month, day));
  }

  // Handle date-only YYYY-MM-DD as UTC midnight
  const ymdMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymdMatch && ymdMatch[1] && ymdMatch[2] && ymdMatch[3]) {
    const year = Number.parseInt(ymdMatch[1], 10);
    const month = Number.parseInt(ymdMatch[2], 10) - 1;
    const day = Number.parseInt(ymdMatch[3], 10);
    return new Date(Date.UTC(year, month, day));
  }

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

export function getCredentialValue(
  credentialsJson: unknown,
  key: string
): string | undefined {
  const credentials = asObject(credentialsJson);
  const value = credentials[key];

  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const safeSize = Math.max(1, size);
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += safeSize) {
    chunks.push(items.slice(index, index + safeSize));
  }

  return chunks;
}

