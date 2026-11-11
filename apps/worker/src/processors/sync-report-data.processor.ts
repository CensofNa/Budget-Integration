import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";

import {
  PgBossWorker as Worker,
  QueueNames,
  acquireSyncLock,
  syncReportDataQueue,
  transformReportDataStagingQueue,
  type SyncReportDataJobData,
  createLogger
} from "@budget-integration/integration-core";

import { syncEntrataReportDataJob } from "../jobs/sync-entrata-report-data.job.js";

const logger = createLogger("rent-details-service", prisma);

function resolveBudgetYear(input: SyncReportDataJobData): number | null {
  if (typeof input.fiscalYear === "number" && Number.isFinite(input.fiscalYear)) {
    return input.fiscalYear;
  }

  if (input.periodStart) {
    const parsed = new Date(input.periodStart);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.getUTCFullYear();
    }
  }

  return null;
}

export const syncReportDataWorker = new Worker<SyncReportDataJobData>(
  QueueNames.SyncReportData,
  async (job) => {
    await logger.info(`SyncReportData worker received job [reportCode=${job.data.reportCode}, jobId=${job.id}]`, {
      action: "WORKER_REPORT_DATA_RECEIVED",
      entityName: "ReportData",
      jobId: String(job.id),
      queueName: QueueNames.SyncReportData,
      companyId: job.data.companyId,
      organisationId: job.data.organisationId,
      integrationSourceId: job.data.integrationSourceId,
      contextJson: {
        reportCode: job.data.reportCode,
        propertyCount: job.data.propertyIds?.length ?? 0,
        ...(job.data.fiscalYear !== undefined ? { fiscalYear: job.data.fiscalYear } : {})
      }
    });

    if (job.name !== "sync-entrata-report-data") {
      await logger.warn(`Unknown SyncReportData job name ignored [jobName=${job.name}]`, {
        action: "WORKER_REPORT_DATA_IGNORED",
        entityName: "ReportData",
        jobId: String(job.id)
      });
      return;
    }

    let lock: Awaited<ReturnType<typeof acquireSyncLock>> | null = null;

    try {
      lock = await acquireSyncLock({
        companyId: job.data.companyId,
        organisationId: job.data.organisationId,
        integrationSourceId: job.data.integrationSourceId,
        entityName: `ReportData:${job.data.reportCode}`,
        ttlMs: 60 * 60 * 1000 // 1 hour
      });

      const result = await syncEntrataReportDataJob(job.data);

      const resolvedFiscalYear =
        result.fiscalYear ?? resolveBudgetYear(job.data) ?? undefined;
      const resolvedPropertyCodes =
        result.propertyCodes && result.propertyCodes.length > 0
          ? result.propertyCodes
          : job.data.propertyIds;

      await logger.info(
        `ReportData sync completed [reportCode=${result.reportCode}, received=${result.recordsReceived}, staged=${result.recordsStaged}, pendingTransform=${result.recordsPendingTransform}]`,
        {
          action: "WORKER_REPORT_DATA_SYNCED",
          entityName: "ReportData",
          jobId: String(job.id),
          syncRunId: result.syncRunId,
          companyId: result.companyId,
          organisationId: result.organisationId,
          integrationSourceId: result.integrationSourceId,
          contextJson: {
            reportCode: result.reportCode,
            reportRunId: result.reportRunId,
            recordsReceived: result.recordsReceived,
            recordsStaged: result.recordsStaged,
            recordsPendingTransform: result.recordsPendingTransform
          }
        }
      );

      if (result.recordsPendingTransform > 0) {
        await transformReportDataStagingQueue.add(
          "transform-report-data-staging",
          {
            companyId: result.companyId,
            organisationId: result.organisationId,
            integrationSourceId: result.integrationSourceId,
            syncRunId: result.syncRunId,
            reportRunId: result.reportRunId,
            reportCode: result.reportCode,
            batchSize: result.transformBatchSize,
            entityName: "ReportData",
            ...(resolvedPropertyCodes ? { propertyCodes: resolvedPropertyCodes } : {}),
            ...(resolvedFiscalYear !== undefined ? { fiscalYear: resolvedFiscalYear } : {})
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

        await logger.info(
          `Queued transform job for reportCode=${result.reportCode} [syncRunId=${result.syncRunId}, pending=${result.recordsPendingTransform}]`,
          {
            action: "TRANSFORM_REPORT_DATA_QUEUED",
            entityName: "ReportData",
            syncRunId: result.syncRunId,
            companyId: result.companyId,
            organisationId: result.organisationId,
            integrationSourceId: result.integrationSourceId,
            contextJson: {
              reportCode: result.reportCode,
              recordsPendingTransform: result.recordsPendingTransform
            }
          }
        );
      } else if (job.data.reportCode === "box_score" && resolvedPropertyCodes?.length) {
        // Fallback: If box_score staged 0 records, chain resident_retention directly so pipeline continues
        await logger.info(
          `box_score staged 0 records; chaining resident_retention for ${resolvedPropertyCodes.length} property(s)`,
          {
            action: "FALLBACK_RESIDENT_RETENTION_QUEUED",
            entityName: "ReportData",
            companyId: job.data.companyId,
            organisationId: job.data.organisationId,
            integrationSourceId: job.data.integrationSourceId,
            contextJson: { propertyCount: resolvedPropertyCodes.length }
          }
        );

        for (const propertyCode of resolvedPropertyCodes) {
          await syncReportDataQueue.add(
            "sync-entrata-report-data",
            {
              companyId: job.data.companyId,
              organisationId: job.data.organisationId,
              integrationSourceId: job.data.integrationSourceId,
              entityName: "ReportData",
              reportCode: "resident_retention",
              propertyIds: [propertyCode],
              ...(resolvedFiscalYear !== undefined ? { fiscalYear: resolvedFiscalYear } : {}),
              filters: {
                period: {
                  period_type: "currentfyr"
                },
                summarize_by: "month",
                consolidate_by: "no_consolidation",
                lease_status: "all",
                early_move_out_grace_period: "31",
                drill_in_column: "",
                unit_type_id: "",
                property_floorplan_id: "",
                month_id: "",
                year_id: "",
                previous_summarize_by: "",
                show_drill_ins: "1"
              }
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
      }

      return result;
    } catch (error) {
      await logger.error(`SyncReportData worker failed [reportCode=${job.data.reportCode}]`, error, {
        action: "WORKER_REPORT_DATA_FAILED",
        entityName: "ReportData",
        jobId: String(job.id),
        queueName: QueueNames.SyncReportData,
        companyId: job.data.companyId,
        organisationId: job.data.organisationId,
        integrationSourceId: job.data.integrationSourceId,
        contextJson: {
          reportCode: job.data.reportCode,
          propertyCount: job.data.propertyIds?.length ?? 0
        }
      });
      throw error;
    } finally {
      if (lock) {
        await lock.release().catch(() => undefined);
      }
    }
  },
  {
    concurrency: 1,
    lockDuration: 30 * 60 * 1000,
    lockRenewTime: 5 * 60 * 1000,
    stalledInterval: 60 * 1000,
    maxStalledCount: 1
  }
);