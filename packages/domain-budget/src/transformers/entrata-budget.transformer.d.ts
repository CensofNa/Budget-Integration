import { Prisma, PrismaClient } from "@prisma/client";
export interface TransformEntrataBudgetInput {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    stagingBudgetId: string;
    sourcePropertyId: string;
    sourceBudgetId: string;
    sourceHash?: string | null;
    rawBudgetPayload: Prisma.JsonValue;
    updateFiscalConfig?: boolean;
}
export declare function transformEntrataBudget(prisma: PrismaClient, input: TransformEntrataBudgetInput): Promise<void>;
//# sourceMappingURL=entrata-budget.transformer.d.ts.map