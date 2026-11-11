import { Prisma } from "@prisma/client";
import { getStringOrNull } from "./object-utils.js";

export function getInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function getDecimal(value: unknown): Prisma.Decimal | null {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? new Prisma.Decimal(parsed) : null;
}

// export function getBoolean(value: unknown): boolean | null {
//   if (value === true || value === "true" || value === 1 || value === "1") return true;
//   if (value === false || value === "false" || value === 0 || value === "0") return false;

//   return null;
// }

// export function parseDate(value: unknown): Date | null {
//   const raw = getStringOrNull(value);

//   if (!raw) return null;

//   const parsed = new Date(raw);
//   return Number.isNaN(parsed.getTime()) ? null : parsed;
// }