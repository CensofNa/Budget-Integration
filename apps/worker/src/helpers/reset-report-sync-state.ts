import { prisma } from "@budget-integration/database";
import {
  QueueNames,
  startPgBoss,
} from "@budget-integration/integration-core";

/**
 * Clears a pg-boss queue safely before starting a fresh manual sync.
 *
 * This should be called before queuing the new sync job.
 * Do not call this from inside the processor that is currently handling the same queue.
 */
async function resetPgBossQueue(queueName: string): Promise<void> {
  console.log(`Resetting pg-boss queue: ${queueName}`);

  const boss = await startPgBoss();
  try {
    await boss.deleteQueue(queueName);
  } catch (error) {
    console.warn(`Could not delete queue ${queueName}`, error);
  }
  await boss.createQueue(queueName);

  console.log(`pg-boss queue reset completed: ${queueName}`);
}

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
   * 1. pg-boss report queues.
   * 2. PostgreSQL staging_report_data rows.
   * 3. Optionally canonical report tables.
   */
export async function resetReportSyncState(
  input: ResetReportSyncStateInput
): Promise<void> {
  const reportCodes =
    input.reportCodes && input.reportCodes.length > 0
      ? input.reportCodes
      : ["box_score", "resident_retention"];

  console.log("Resetting report sync state.", {
    reportCodes,
    propertyCodes: input.propertyCodes,
    clearAllStaging: input.clearAllStaging ?? false,
    clearCanonicalReportData: input.clearCanonicalReportData ?? false,
  });

  /**
   * 1. Clear pg-boss queues.
   *
   * This prevents old pending sync/transform/projection jobs from running
   * together with the new manual sync.
   */
  await resetPgBossQueue(QueueNames.SyncReportData);
  await resetPgBossQueue(QueueNames.TransformReportDataStaging);
  await resetPgBossQueue(QueueNames.ProjectOccupancyFromReports);

  /**
   * 2. Clear PostgreSQL staging rows.
   *
   * By default, delete only unfinished rows.
   * If clearAllStaging = true, delete all selected staging rows.
   */
  const stagingWhere: any = {
    companyId: input.companyId,
    organisationId: input.organisationId,
    integrationSourceId: input.integrationSourceId,
    reportCode: {
      in: reportCodes,
    },
  };

  if (input.propertyCodes && input.propertyCodes.length > 0) {
    stagingWhere.propertyCode = {
      in: input.propertyCodes,
    };
  }

  if (!input.clearAllStaging) {
    stagingWhere.transformStatus = {
      in: ["PENDING", "FAILED", "QUEUED", "STAGED"],
    };
  }

  const deletedStaging = await prisma.stagingReportData.deleteMany({
    where: stagingWhere,
  });

  console.log("Deleted staging_report_data rows.", {
    count: deletedStaging.count,
  });

  /**
   * 3. Optional: clear canonical transformed report data.
   *
   * Use this only for a full clean re-sync.
   */
  if (input.clearCanonicalReportData) {
    const canonicalWhere: any = {
      companyId: input.companyId,
      organisationId: input.organisationId,
    };

    if (input.propertyCodes && input.propertyCodes.length > 0) {
      canonicalWhere.propertyCode = {
        in: input.propertyCodes,
      };
    }

    if (reportCodes.includes("box_score")) {
      const deletedBoxScoreMonthly =
        await prisma.propertyBoxScoreMonthly.deleteMany({
          where: canonicalWhere,
        });

      const deletedBoxScoreUnitType =
        await prisma.propertyBoxScoreUnitTypeMonthly.deleteMany({
          where: canonicalWhere,
        });

      console.log("Deleted Box Score canonical rows.", {
        propertyBoxScoreMonthly: deletedBoxScoreMonthly.count,
        propertyBoxScoreUnitTypeMonthly: deletedBoxScoreUnitType.count,
      });
    }

    if (reportCodes.includes("resident_retention")) {
      const deletedResidentRetention =
        await prisma.propertyResidentRetentionMonthly.deleteMany({
          where: canonicalWhere,
        });

      console.log("Deleted Resident Retention canonical rows.", {
        propertyResidentRetentionMonthly: deletedResidentRetention.count,
      });
    }
  }

  console.log("Report sync state reset completed.");
}