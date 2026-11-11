import { syncBudgetQueue } from "@budget-integration/integration-core";
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

  return "*/15 * * * *";
}

export async function registerEntrataBudgetSchedulers(): Promise<void> {
  const sources = await prisma.integrationSource.findMany({
    where: {
      sourceType: "entrata",
      isActive: true,
      entities: {
        some: {
          entityName: "Budget",
          isEnabled: true
        }
      }
    },
    include: {
      entities: {
        where: {
          entityName: "Budget",
          isEnabled: true
        }
      }
    }
  });

  for (const source of sources) {
    const budgetEntity = source.entities[0];
    const cronPattern = getSchedulePattern(budgetEntity?.syncSettingsJson);

    const schedulerId = `sync-entrata-budgets-${source.companyId}-${source.organisationId}-${source.id}`;

    await syncBudgetQueue.upsertJobScheduler(
      schedulerId,
      {
        pattern: cronPattern
      },
      {
        name: "sync-entrata-budgets",
        data: {
          companyId: source.companyId,
          organisationId: source.organisationId,
          integrationSourceId: source.id,
          entityName: "Budget"
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
      `Registered Budget scheduler: ${schedulerId}, Source: ${source.sourceCode}, Cron: ${cronPattern}`
    );
  }
}