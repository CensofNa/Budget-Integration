import { Prisma, PrismaClient } from "@prisma/client";
export interface TransformEntrataPropertyInput {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    stagingPropertyId: string;
    sourceRecordId: string;
    sourceHash?: string | null;
    rawPropertyPayload: Prisma.JsonValue;
    updateFiscalConfig?: boolean | undefined;
}
import { resolveSystemAdminUserId } from "@budget-integration/integration-core";
export { resolveSystemAdminUserId };
export declare function transformEntrataProperty(prisma: PrismaClient, input: TransformEntrataPropertyInput): Promise<void>;
//# sourceMappingURL=entrata-property.transformer.d.ts.map