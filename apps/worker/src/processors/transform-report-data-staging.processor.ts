import { prisma } from "@budget-integration/database";

import {
  PgBossWorker as Worker,
  QueueNames,
  syncReportDataQueue,
  projectOccupancyFromReportsQueue,
  type TransformReportDataStagingJobData,
  createLogger
} from "@budget-integration/integration-core";

import { transformStagedReportDataJob } from "../jobs/transform-staged-report-data.job.js";

const logger = createLogger("rent-details-service", prisma);

async function resolvePropertyCodesForReport(
  jobData: TransformReportDataStagingJobData
): Promise<string[]> {
  if (jobData.propertyCodes && jobData.propertyCodes.length > 0) {
    return jobData.propertyCodes;
  }
  if (jobData.propertyIds && jobData.propertyIds.length > 0) {
    return jobData.propertyIds;
  }

  // Fallback: lookup from staging batches for this syncRunId
  const stagingBatches = await prisma.stagingApiBatch.findMany({
    where: {
      syncRunId: jobData.syncRunId,
      entityName: "ReportData"
    },
    select: {
      rawRequest: true
    }
  });

  const codes = new Set<string>();
  for (const batch of stagingBatches) {
    const raw = batch.rawRequest as Record<string, unknown> | null;
    const filters = raw?.filters as Record<string, unknown> | null;
    const propertyGroupIds = filters?.property_group_ids;
    if (Array.isArray(propertyGroupIds)) {
      for (const id of propertyGroupIds) {
        if (id) codes.add(String(id));
      }
    } else if (propertyGroupIds) {
      codes.add(String(propertyGroupIds));
    }
  }

  return Array.from(codes);
}

export const transformReportDataStagingWorker =
  new Worker<TransformReportDataStagingJobData>(
    QueueNames.TransformReportDataStaging,
    async (job) => {
      await logger.info(
        `TransformReportDataStaging worker received job [reportCode=${job.data.reportCode}, jobId=${job.id}]`,
        {
          action: "WORKER_TRANSFORM_REPORT_DATA_RECEIVED",
          entityName: "ReportData",
          jobId: String(job.id),
          queueName: QueueNames.TransformReportDataStaging,
          companyId: job.data.companyId,
          organisationId: job.data.organisationId,
          integrationSourceId: job.data.integrationSourceId,
          syncRunId: job.data.syncRunId,
          contextJson: {
            reportCode: job.data.reportCode,
            reportRunId: job.data.reportRunId
          }
        }
      );

      try {
        const result = await transformStagedReportDataJob({
          companyId: job.data.companyId,
          organisationId: job.data.organisationId,
          integrationSourceId: job.data.integrationSourceId,
          syncRunId: job.data.syncRunId,
          reportRunId: job.data.reportRunId,
          reportCode: job.data.reportCode,
          batchSize: job.data.batchSize ?? 100
        });

        await logger.info(
          `ReportData transform completed [reportCode=${job.data.reportCode}, transformed=${result.transformed}, failed=${result.failed}]`,
          {
            action: "WORKER_TRANSFORM_REPORT_DATA_COMPLETED",
            entityName: "ReportData",
            jobId: String(job.id),
            syncRunId: job.data.syncRunId,
            companyId: job.data.companyId,
            organisationId: job.data.organisationId,
            integrationSourceId: job.data.integrationSourceId,
            contextJson: {
              reportCode: job.data.reportCode,
              transformed: result.transformed,
              failed: result.failed
            }
          }
        );

        // 1. After box_score transformation: chain resident_retention for each property
        if (job.data.reportCode === "box_score") {
          const propertyCodes = await resolvePropertyCodesForReport(job.data);
          await logger.info(
            `box_score transformation completed; chaining resident_retention for ${propertyCodes.length} property(s)`,
            {
              action: "CHAIN_RESIDENT_RETENTION_QUEUED",
              entityName: "ReportData",
              syncRunId: job.data.syncRunId,
              companyId: job.data.companyId,
              organisationId: job.data.organisationId,
              integrationSourceId: job.data.integrationSourceId,
              contextJson: { propertyCount: propertyCodes.length }
            }
          );

          for (const propertyCode of propertyCodes) {
            await syncReportDataQueue.add(
              "sync-entrata-report-data",
              {
                companyId: job.data.companyId,
                organisationId: job.data.organisationId,
                integrationSourceId: job.data.integrationSourceId,
                entityName: "ReportData",
                reportCode: "resident_retention",
                propertyIds: [propertyCode],
                ...(job.data.fiscalYear !== undefined ? { fiscalYear: job.data.fiscalYear } : {}),
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

        // 2. After resident_retention transformation: chain project-occupancy-from-reports immediately
        if (job.data.reportCode === "resident_retention") {
          const propertyCodes = await resolvePropertyCodesForReport(job.data);
          await logger.info(
            `resident_retention transformation completed; triggering occupancy projection for ${propertyCodes.length} property(s)`,
            {
              action: "CHAIN_PROJECT_OCCUPANCY_QUEUED",
              entityName: "Occupancy",
              syncRunId: job.data.syncRunId,
              companyId: job.data.companyId,
              organisationId: job.data.organisationId,
              integrationSourceId: job.data.integrationSourceId,
              contextJson: { propertyCount: propertyCodes.length }
            }
          );

          for (const propertyCode of propertyCodes) {
            const numericId = Number.parseInt(propertyCode, 10);
            const property = await prisma.property.findFirst({
              where: {
                companyId: job.data.companyId,
                organisationId: job.data.organisationId,
                isDisabled: false,
                OR: [
                  { code: propertyCode },
                  ...(Number.isInteger(numericId) && numericId > 0 ? [{ externalId: numericId }] : [])
                ]
              },
              select: {
                id: true,
                code: true,
                budgetYear: true
              }
            });

            if (property) {
              const budgetYear =
                job.data.fiscalYear ?? property.budgetYear ?? new Date().getUTCFullYear();

              await projectOccupancyFromReportsQueue.add(
                "project-occupancy-from-reports",
                {
                  companyId: job.data.companyId,
                  organisationId: job.data.organisationId,
                  integrationSourceId: job.data.integrationSourceId,
                  entityName: "Occupancy",
                  propertyId: property.id,
                  budgetYear
                },
                {
                  attempts: 3,
                  backoff: {
                    type: "exponential",
                    delay: 10000
                  },
                  removeOnComplete: 100,
                  removeOnFail: 1000
                }
              );
            } else {
              await logger.warn(
                `Property not found for code: ${propertyCode}; skipping occupancy projection`,
                {
                  action: "CHAIN_PROJECT_OCCUPANCY_SKIPPED",
                  entityName: "Occupancy",
                  syncRunId: job.data.syncRunId,
                  companyId: job.data.companyId,
                  contextJson: { propertyCode }
                }
              );
            }
          }
        }

        return result;
      } catch (error) {
        await logger.error(
          `TransformReportDataStaging worker failed [reportCode=${job.data.reportCode}]`,
          error,
          {
            action: "WORKER_TRANSFORM_REPORT_DATA_FAILED",
            entityName: "ReportData",
            jobId: String(job.id),
            queueName: QueueNames.TransformReportDataStaging,
            companyId: job.data.companyId,
            organisationId: job.data.organisationId,
            integrationSourceId: job.data.integrationSourceId,
            syncRunId: job.data.syncRunId,
            contextJson: {
              reportCode: job.data.reportCode,
              reportRunId: job.data.reportRunId
            }
          }
        );
        throw error;
      }
    },
    {
      concurrency: 2
    }
  );