import type { PrismaClient } from "@prisma/client";
export declare function transformResidentRetentionReport(prisma: PrismaClient, input: {
    stagingReportDataId: string;
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    sourceRecordId: string;
    sourceHash?: string | null;
    rawRecordPayload: unknown;
}): Promise<void>;
//# sourceMappingURL=resident-retention.transformer.d.ts.map