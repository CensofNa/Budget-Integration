import { prisma } from "@budget-integration/database";
import {
  PgBossWorker as Worker,
  QueueNames,
  createLogger
} from "@budget-integration/integration-core";

import { projectOccupancyFromReportsJob } from "../jobs/project-occupancy-from-reports.job.js";

const logger = createLogger("rent-details-service", prisma);

interface ProjectOccupancyJobData {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
  propertyId: string;
  budgetYear: number;
}

export const projectOccupancyFromReportsWorker =
  new Worker<ProjectOccupancyJobData>(
    QueueNames.ProjectOccupancyFromReports,
    async (job) => {
      await logger.info(
        `ProjectOccupancy worker received job [propertyId=${job.data.propertyId}, budgetYear=${job.data.budgetYear}, jobId=${job.id}]`,
        {
          action: "WORKER_PROJECT_OCCUPANCY_RECEIVED",
          entityName: "Occupancy",
          jobId: String(job.id),
          queueName: QueueNames.ProjectOccupancyFromReports,
          companyId: job.data.companyId,
          organisationId: job.data.organisationId,
          integrationSourceId: job.data.integrationSourceId,
          contextJson: {
            propertyId: job.data.propertyId,
            budgetYear: job.data.budgetYear
          }
        }
      );

      if (job.name !== "project-occupancy-from-reports") {
        await logger.warn(`Unknown ProjectOccupancy job name ignored [jobName=${job.name}]`, {
          action: "WORKER_PROJECT_OCCUPANCY_IGNORED",
          entityName: "Occupancy",
          jobId: String(job.id)
        });
        return;
      }

      try {
        const result = await projectOccupancyFromReportsJob(job.data);

        await logger.info(
          `ProjectOccupancy completed for property ${job.data.propertyId}: ${result.projectedRows} rows projected, ${result.skippedRows} skipped`,
          {
            action: "WORKER_PROJECT_OCCUPANCY_COMPLETED",
            entityName: "Occupancy",
            jobId: String(job.id),
            companyId: job.data.companyId,
            organisationId: job.data.organisationId,
            integrationSourceId: job.data.integrationSourceId,
            contextJson: {
              propertyId: job.data.propertyId,
              budgetYear: job.data.budgetYear,
              projectedRows: result.projectedRows,
              skippedRows: result.skippedRows,
              totalMasterRows: result.totalMasterRows
            }
          }
        );

        return result;
      } catch (error) {
        await logger.error(
          `ProjectOccupancy failed for property ${job.data.propertyId} (budgetYear: ${job.data.budgetYear})`,
          error,
          {
            action: "WORKER_PROJECT_OCCUPANCY_FAILED",
            entityName: "Occupancy",
            jobId: String(job.id),
            queueName: QueueNames.ProjectOccupancyFromReports,
            companyId: job.data.companyId,
            organisationId: job.data.organisationId,
            integrationSourceId: job.data.integrationSourceId,
            contextJson: {
              propertyId: job.data.propertyId,
              budgetYear: job.data.budgetYear
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