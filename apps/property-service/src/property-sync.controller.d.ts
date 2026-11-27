import { type LogLevel } from "@budget-integration/integration-core";
import type { SyncPropertiesRequestDto, SyncPropertyUnitsRequestDto, SyncUnitTypesRequestDto, SyncGlTreeRequestDto } from "@budget-integration/domain-property";
export declare class PropertySyncController {
    getHealth(): Promise<{
        status: string;
        service: string;
        domain: string;
        timestamp: string;
    }>;
    getLogs(page?: string, limit?: string, level?: LogLevel, service?: string, entityName?: string, action?: string, companyId?: string, syncRunId?: string, search?: string, startDate?: string, endDate?: string): Promise<import("@budget-integration/integration-core").PaginatedLogsResult<any>>;
    syncProperties(body: SyncPropertiesRequestDto): Promise<{
        queued: boolean;
        jobId: string | undefined;
        entityName: string;
    }>;
    syncPropertiesDirect(body: SyncPropertiesRequestDto, queryAutoTransform?: string): Promise<{
        success: boolean;
        entityName: string;
        syncRunId: string | undefined;
        stagingBatchId: string | undefined;
        recordsStaged: number;
        transformed: boolean;
        transformResult: {
            transformed: number;
            failed: number;
        } | null;
    }>;
    syncPropertyUnits(body: SyncPropertyUnitsRequestDto): Promise<{
        queued: boolean;
        jobId: string | undefined;
        entityName: string;
    }>;
    syncPropertyUnitsDirect(body: SyncPropertyUnitsRequestDto, queryAutoTransform?: string): Promise<{
        success: boolean;
        entityName: string;
        syncRunId: string | undefined;
        recordsReceived: number;
        recordsStaged: number;
        recordsSkipped: number;
        recordsPendingTransform: number;
        transformed: boolean;
        transformResult: {
            transformed: number;
            failed: number;
        } | null;
    }>;
    syncUnitTypes(body: SyncUnitTypesRequestDto): Promise<{
        queued: boolean;
        jobId: string | undefined;
        entityName: string;
    }>;
    syncUnitTypesDirect(body: SyncUnitTypesRequestDto, queryAutoTransform?: string): Promise<{
        success: boolean;
        entityName: string;
        syncRunId: string | undefined;
        recordsReceived: number;
        recordsStaged: number;
        recordsSkipped: number;
        recordsPendingTransform: number;
        transformed: boolean;
        transformResult: {
            transformed: number;
            failed: number;
        } | null;
    }>;
    syncGlTrees(body: SyncGlTreeRequestDto): Promise<{
        queued: boolean;
        jobId: string | undefined;
        entityName: string;
    }>;
    syncGlTreesDirect(body: SyncGlTreeRequestDto, queryAutoTransform?: string): Promise<{
        success: boolean;
        entityName: string;
        syncRunId: string | undefined;
        stagingBatchId: string | undefined;
        recordsReceived: number;
        recordsStaged: number;
        recordsSkipped: number;
        recordsPendingTransform: number;
        transformed: boolean;
        transformResult: {
            transformed: number;
            failed: number;
        } | null;
    }>;
}
//# sourceMappingURL=property-sync.controller.d.ts.map