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
    syncPropertyUnits(body: SyncPropertyUnitsRequestDto): Promise<{
        queued: boolean;
        jobId: string | undefined;
        entityName: string;
    }>;
    syncUnitTypes(body: SyncUnitTypesRequestDto): Promise<{
        queued: boolean;
        jobId: string | undefined;
        entityName: string;
    }>;
    syncGlTrees(body: SyncGlTreeRequestDto): Promise<{
        queued: boolean;
        jobId: string | undefined;
        entityName: string;
    }>;
}
//# sourceMappingURL=property-sync.controller.d.ts.map