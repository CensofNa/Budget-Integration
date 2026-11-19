import { Prisma, type PrismaClient } from "@prisma/client";
export interface TransformEntrataGlTreeInput {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    stagingGlTreeId: string;
    sourceGlTreeId: string;
    sourceBranchId?: string | null;
    sourceGlAccountId?: string | null;
    recordType: "TREE" | "BRANCH" | "ACCOUNT";
    sourceRecordId: string;
    sourceHash?: string | null;
    rawGlTreePayload: Prisma.JsonValue;
}
export declare function transformEntrataGlTree(prisma: PrismaClient, input: TransformEntrataGlTreeInput): Promise<void>;
//# sourceMappingURL=entrata-gl-tree.transformer.d.ts.map