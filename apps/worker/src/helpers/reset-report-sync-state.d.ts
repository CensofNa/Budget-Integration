export interface ResetReportSyncStateInput {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    reportCodes?: string[];
    propertyCodes?: string[];
    /**
     * false = delete only pending/failed staging rows.
     * true  = delete all staging rows for selected reports/properties.
     */
    clearAllStaging?: boolean;
    /**
     * false = keep canonical transformed tables.
     * true  = delete transformed Box Score / Resident Retention rows also.
     */
    clearCanonicalReportData?: boolean;
}
/**
 * Resets report sync state before starting a new manual report sync.
 *
 * Clears:
 * 1. BullMQ Redis report queues.
 * 2. PostgreSQL staging_report_data rows.
 * 3. Optionally canonical report tables.
 */
export declare function resetReportSyncState(input: ResetReportSyncStateInput): Promise<void>;
//# sourceMappingURL=reset-report-sync-state.d.ts.map