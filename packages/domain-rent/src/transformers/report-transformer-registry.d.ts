import type { PrismaClient } from "@prisma/client";
export interface ReportTransformerPropertyCacheItem {
    id: string;
    code: string | null;
    externalId: number | null;
    name: string | null;
    fiscalYearStartMonth: number | null;
    reforecastLockedTillMonth?: number | null;
}
export interface ReportTransformerInput {
    stagingReportDataId: string;
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    reportCode: string;
    sourceRecordId: string;
    sourceHash?: string | null;
    rawRecordPayload: unknown;
    rawRequest?: unknown;
    cachedProperties?: ReportTransformerPropertyCacheItem[];
}
export type ReportTransformer = (prisma: PrismaClient, input: ReportTransformerInput) => Promise<void>;
export declare function getReportTransformer(reportCode: string): ReportTransformer | undefined;
//# sourceMappingURL=report-transformer-registry.d.ts.map