import {
  syncReportDataQueue
} from "@budget-integration/integration-core";

/**
 * Initiates the occupancy report sync pipeline for a property.
 * Queuing box_score will automatically:
 * 1. Sync & stage box_score
 * 2. Transform into property_box_score_monthly & property_box_score_unit_type_monthly
 * 3. Chain resident_retention sync for the property (currentfyr)
 * 4. Transform into property_resident_retention_monthly
 * 5. Trigger project-occupancy-from-reports immediately
 */
export async function enqueueOccupancyReportSync(input: {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
  propertyId: string;
  propertyCode: string;
  budgetYear: number;
  includePriorYear?: boolean;
}): Promise<void> {
  await syncReportDataQueue.add(
    "sync-entrata-report-data",
    {
      companyId: input.companyId,
      organisationId: input.organisationId,
      integrationSourceId: input.integrationSourceId,
      entityName: "ReportData",
      reportCode: "box_score",
      propertyIds: [input.propertyCode],
      fiscalYear: input.budgetYear,
      includePriorYear: input.includePriorYear ?? false
    },
    {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000
      },
      removeOnComplete: 100,
      removeOnFail: 1000
    }
  );
}