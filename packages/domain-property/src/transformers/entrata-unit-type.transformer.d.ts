import { Prisma, PrismaClient } from "@prisma/client";
export interface TransformEntrataUnitTypeInput {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    stagingUnitTypeId: string;
    sourcePropertyId: string;
    sourceUnitTypeId: string;
    sourceHash?: string | null;
    rawUnitTypePayload: Prisma.JsonValue;
}
export declare function transformEntrataUnitType(prisma: PrismaClient, input: TransformEntrataUnitTypeInput): Promise<void>;
//# sourceMappingURL=entrata-unit-type.transformer.d.ts.map