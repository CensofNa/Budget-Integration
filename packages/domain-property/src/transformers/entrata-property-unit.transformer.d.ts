import { PrismaClient } from "@prisma/client";
export interface TransformEntrataPropertyUnitInput {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    stagingPropertyUnitId: string;
    sourcePropertyId: string;
    sourceUnitId: string | null;
    remotePrimaryKey: string | null;
    sourceHash?: string | null;
    rawUnitPayload: unknown;
}
export declare function transformEntrataPropertyUnitsBatch(prisma: PrismaClient, inputs: TransformEntrataPropertyUnitInput[]): Promise<{
    transformed: number;
    failed: number;
    failures: Array<{
        stagingPropertyUnitId: string;
        error: unknown;
    }>;
}>;
export declare function transformEntrataPropertyUnit(prisma: PrismaClient, input: TransformEntrataPropertyUnitInput): Promise<void>;
//# sourceMappingURL=entrata-property-unit.transformer.d.ts.map