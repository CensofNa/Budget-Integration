import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";
import { syncPropertyUnitQueue, QueueNames } from "@budget-integration/integration-core";
import {
  asObject,
  asArray,
  getString,
  getNumberFromJson,
  getCredentialValue,
  chunkArray,
  type JsonObject
} from "@budget-integration/integration-core";

function getSchedulePattern(syncSettingsJson: unknown): string {
  if (
    syncSettingsJson &&
    typeof syncSettingsJson === "object" &&
    !Array.isArray(syncSettingsJson)
  ) {
    // const value = (syncSettingsJson as Record<string, unknown>).propertyUnitSchedule;
    const value = (syncSettingsJson as Record<string, unknown>).schedule;

    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return "15 */1 * * *";
}

export async function registerEntrataPropertyUnitSchedulers(): Promise<void> {
  const sources = await prisma.integrationSource.findMany({
    where: {
      sourceType: "entrata",
      isActive: true,
      entities: {
        some: {
          entityName: "PropertyUnit",
          isEnabled: true
        }
      }
    },
    include: {
      config: true,
      entities: {
        where: {
          entityName: "PropertyUnit",
          isEnabled: true
        }
      }
    }
  });

  for (const source of sources) {
    const schedulerId = `sync-entrata-property-units-${source.companyId}-${source.organisationId}-${source.id}`;
    // const cronPattern = getSchedulePattern(source.config?.syncSettingsJson);

    const propertyUnitEntity = source.entities[0];
    const cronPattern = getSchedulePattern(propertyUnitEntity?.syncSettingsJson);

    await syncPropertyUnitQueue.upsertJobScheduler(
      schedulerId,
      {
        pattern: cronPattern
      },
      {
        name: "sync-entrata-property-units",
        data: {
          companyId: source.companyId,
          organisationId: source.organisationId,
          integrationSourceId: source.id,
          entityName: "PropertyUnit"
        },
        opts: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000
          },
          removeOnComplete: 100,
          removeOnFail: 1000
        }
      }
    );

    await prisma.integrationQueueJob.create({
      data: {
        companyId: source.companyId,
        organisationId: source.organisationId,
        integrationSourceId: source.id,
        queueName: QueueNames.SyncPropertyUnit,
        jobName: "sync-entrata-property-units-scheduler",
        entityName: "PropertyUnit",
        status: "QUEUED",
        payloadJson: {
          schedulerId,
          cronPattern,
          sourceCode: source.sourceCode
        } as Prisma.InputJsonValue
      }
    });

    console.log(
      `Registered PropertyUnit scheduler: ${schedulerId}, Source: ${source.sourceCode}, Cron: ${cronPattern}`
    );
  }
}