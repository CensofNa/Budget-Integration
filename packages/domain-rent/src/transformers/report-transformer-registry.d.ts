import type { PrismaClient } from "@prisma/client";
export interface ReportTransformerInput {
    stagingReportDataId: string;
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    reportCode: string;
    sourceRecordId: string;
    sourceHash?: string | null;
    rawRecordPayload: unknown;
}
export type ReportTransformer = (prisma: PrismaClient, input: ReportTransformerInput) => Promise<void>;
export declare function getReportTransformer(reportCode: string): ReportTransformer | undefined;
//# sourceMappingURL=report-transformer-registry.d.ts.map