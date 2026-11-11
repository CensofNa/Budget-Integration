import { syncBudgetActualQueue } from "@budget-integration/integration-core";

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

  return "0 3 * * *";
}

function getStringSetting(
  syncSettingsJson: unknown,
  key: string,
  defaultValue: string
): string {
  if (
    syncSettingsJson &&
    typeof syncSettingsJson === "object" &&
    !Array.isArray(syncSettingsJson)
  ) {
    const value = (syncSettingsJson as Record<string, unknown>)[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }

    if (typeof value === "number") {
      return String(value);
    }
  }

  return defaultValue;
}

export async function registerEntrataBudgetActualSchedulers(): Promise<void> {
  const sources = await prisma.integrationSource.findMany({
    where: {
      sourceType: "entrata",
      isActive: true,
      entities: {
        some: {
          entityName: "BudgetActual",
          isEnabled: true
        }
      }
    },
    include: {
      entities: {
        where: {
          entityName: "BudgetActual",
          isEnabled: true
        }
      }
    }
  });

  for (const source of sources) {
    const entity = source.entities[0];

    if (!entity) {
      continue;
    }

    const cronPattern = getSchedulePattern(entity.syncSettingsJson);

    const accountingMethod = getStringSetting(
      entity.syncSettingsJson,
      "accountingMethod",
      "Accrual"
    );

    const budgetStatusTypeIds = getStringSetting(
      entity.syncSettingsJson,
      "budgetStatusTypeIds",
      getStringSetting(entity.syncSettingsJson, "budgetStatusTypeId", "1")
    );

    const schedulerId = `sync-entrata-budget-actuals-${source.companyId}-${source.organisationId}-${source.id}`;

    await syncBudgetActualQueue.upsertJobScheduler(
      schedulerId,
      {
        pattern: cronPattern
      },
      {
        name: "sync-entrata-budget-actuals",
        data: {
          companyId: source.companyId,
          organisationId: source.organisationId,
          integrationSourceId: source.id,
          entityName: "BudgetActual",
          accountingMethod,
          budgetStatusTypeIds
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
      `Registered BudgetActual scheduler: ${schedulerId}, Source: ${source.sourceCode}, Cron: ${cronPattern}`
    );
  }
}