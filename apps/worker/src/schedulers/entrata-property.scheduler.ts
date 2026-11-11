import { syncPropertyQueue } from "@budget-integration/integration-core";
import { prisma } from "@budget-integration/database";
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
    const value = (syncSettingsJson as Record<string, unknown>).schedule;

    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  // Default: every hour
  return "0 * * * *";
}

export async function registerEntrataPropertySchedulers(): Promise<void> {
  const sources = await prisma.integrationSource.findMany({
    where: {
      sourceType: "entrata",
      isActive: true,
      entities: {
        some: {
          entityName: "Property",
          isEnabled: true
        }
      }
    },
    include: {
      config: true,
      entities: {
        where: {
          entityName: "Property",
          isEnabled: true
        }
      }
    }
  });



  for (const source of sources) {
    const schedulerId = `sync-entrata-property-${source.companyId}-${source.organisationId}-${source.id}`;
    // const cronPattern = getSchedulePattern(source.config?.syncSettingsJson);

    const propertyEntity = source.entities[0];
    const cronPattern = getSchedulePattern(propertyEntity?.syncSettingsJson);

    await syncPropertyQueue.upsertJobScheduler(
      schedulerId,
      {
        pattern: cronPattern
      },
      {
        name: "sync-entrata-property",
        data: {
          companyId: source.companyId,
          organisationId: source.organisationId,
          integrationSourceId: source.id,
          entityName: "Property"
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

    console.log(
      `Registered Property scheduler: ${schedulerId}, Source: ${source.sourceCode}, Cron: ${cronPattern}`
    );
  }
}