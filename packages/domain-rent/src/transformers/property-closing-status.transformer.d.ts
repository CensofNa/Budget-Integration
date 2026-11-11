import { PrismaClient } from "@prisma/client";
export declare function transformPropertyClosingStatus(prisma: PrismaClient, input: {
    stagingReportDataId: string;
    companyId: string;
    organisationId: string;
    sourceRecordId: string;
    sourceHash?: string | null;
    rawRecordPayload: unknown;
}): Promise<void>;
//# sourceMappingURL=property-closing-status.transformer.d.ts.map