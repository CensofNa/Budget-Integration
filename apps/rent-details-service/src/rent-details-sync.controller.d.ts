import { type LogLevel } from "@budget-integration/integration-core";
import { SyncReportDataRequestDto } from "@budget-integration/domain-rent";
export declare class RentDetailsSyncController {
    getHealth(): Promise<{
        status: string;
        service: string;
        domain: string;
        timestamp: string;
    }>;
    getLogs(page?: string, limit?: string, level?: LogLevel, service?: string, entityName?: string, action?: string, search?: string, syncRunId?: string, companyId?: string, startDate?: string, endDate?: string): Promise<import("@budget-integration/integration-core").PaginatedLogsResult<any>>;
    syncBoxScore(body: SyncReportDataRequestDto): Promise<{
        queued: boolean;
        jobId: string | undefined;
        entityName: string;
    }>;
    syncResidentRetention(body: SyncReportDataRequestDto): Promise<{
        queued: boolean;
        jobId: string | undefined;
        entityName: string;
    }>;
    projectOccupancy(body: {
        companyId: string;
        organisationId: string;
        integrationSourceId: string;
        propertyId: string;
        budgetYear: number;
        updateReforecast?: boolean;
        reforecastPostMonth?: string;
    }): Promise<{
        queued: boolean;
        jobId: string | undefined;
        entityName: string;
    }>;
}
//# sourceMappingURL=rent-details-sync.controller.d.ts.map