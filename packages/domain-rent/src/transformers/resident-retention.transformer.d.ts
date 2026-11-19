import type { PrismaClient } from "@prisma/client";
export declare function transformResidentRetentionReport(prisma: PrismaClient, input: {
    stagingReportDataId: string;
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    sourceRecordId: string;
    sourceHash?: string | null;
    rawRecordPayload: unknown;
    rawRequest?: unknown;
    cachedProperties?: Array<{
        id: string;
        code: string | null;
        externalId: number | null;
        name: string | null;
        fiscalYearStartMonth: number | null;
        reforecastLockedTillMonth?: number | null;
    }>;
}): Promise<void>;
//# sourceMappingURL=resident-retention.transformer.d.ts.map