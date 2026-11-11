import { syncUnitTypeQueue } from "@budget-integration/integration-core";
import { prisma } from "@budget-integration/database";

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

  // Default: every 10 minutes
  return "*/10 * * * *";
}

export async function registerEntrataUnitTypeSchedulers(): Promise<void> {
  const sources = await prisma.integrationSource.findMany({
    where: {
      sourceType: "entrata",
      isActive: true,
      entities: {
        some: {
          entityName: "UnitType",
          isEnabled: true
        }
      }
    },
    include: {
      entities: {
        where: {
          entityName: "UnitType",
          isEnabled: true
        }
      }
    }
  });

  for (const source of sources) {
    const unitTypeEntity = source.entities[0];
    const cronPattern = getSchedulePattern(unitTypeEntity?.syncSettingsJson);

    const schedulerId = `sync-entrata-unit-types-${source.companyId}-${source.organisationId}-${source.id}`;

    await syncUnitTypeQueue.upsertJobScheduler(
      schedulerId,
      {
        pattern: cronPattern
      },
      {
        name: "sync-entrata-unit-types",
        data: {
          companyId: source.companyId,
          organisationId: source.organisationId,
          integrationSourceId: source.id,
          entityName: "UnitType"
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
      `Registered UnitType scheduler: ${schedulerId}, Source: ${source.sourceCode}, Cron: ${cronPattern}`
    );
  }
}