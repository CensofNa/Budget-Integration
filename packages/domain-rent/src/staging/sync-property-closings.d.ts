import { PrismaClient } from "@prisma/client";
export interface SyncPropertyClosingsInput {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    propertyIds?: string[];
}
export interface SyncPropertyClosingsResult {
    success: boolean;
    syncedCount: number;
    errors: string[];
}
export declare function syncPropertyClosings(prisma: PrismaClient, input: SyncPropertyClosingsInput): Promise<SyncPropertyClosingsResult>;
//# sourceMappingURL=sync-property-closings.d.ts.map