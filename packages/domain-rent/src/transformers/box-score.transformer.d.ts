import type { PrismaClient } from "@prisma/client";
export declare function resolveFiscalYearForReportMonth(reportMonth: Date, fiscalStartMonth?: number | null): number;
export declare function transformBoxScoreReport(prisma: PrismaClient, input: {
    stagingReportDataId: string;
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    sourceRecordId: string;
    sourceHash?: string | null;
    rawRecordPayload: unknown;
}): Promise<void>;
//# sourceMappingURL=box-score.transformer.d.ts.map