import { Prisma } from "@prisma/client";
export type JsonObject = Record<string, unknown>;
export declare function asObject(value: unknown): JsonObject;
export declare function asArray(value: unknown): JsonObject[];
export declare function getStringArray(value: unknown): string[];
export declare function getString(value: unknown): string | undefined;
export declare function getStringOrNull(value: unknown): string | null;
export declare function getDecimal(value: unknown): Prisma.Decimal | null;
export declare function getBoolean(value: unknown): boolean;
export declare function getNumberFromJson(value: unknown, defaultValue: number): number;
export declare function getInt(value: unknown): number | null;
export declare function parseDate(value: unknown): Date | null;
export declare function getCredentialValue(credentialsJson: unknown, key: string): string | undefined;
export declare function chunkArray<T>(items: T[], size: number): T[][];
//# sourceMappingURL=object-utils.d.ts.map