import { type PrismaClient } from "@prisma/client";
export interface TransformEntrataBudgetActualInput {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    stagingBudgetActualId: string;
    sourcePropertyId: string;
    sourceBudgetId: string;
    sourceGlTreeId: string;
    sourceGlAccountId: string;
    fiscalYear: number;
    postMonth: Date;
    accountingMethod: string;
    sourceHash: string;
    rawPayloadJson: unknown;
}
export declare function transformEntrataBudgetActual(prisma: PrismaClient, input: TransformEntrataBudgetActualInput): Promise<void>;
//# sourceMappingURL=entrata-budget-actual.transformer.d.ts.map