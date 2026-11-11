import { prisma } from "@budget-integration/database";
import {
  projectBalanceSheetActualsQueue,
  type TransformBalanceSheetActualsJobData,
} from "@budget-integration/integration-core";

type TransformBalanceSheetActualsDbResult = {
  inserted_count: number;
  updated_count: number;
  warning_count: number;
  failed_count: number;
};

type TransformBalanceSheetActualsResult = {
  syncRunId: string;
  insertedCount: number;
  updatedCount: number;
  warningCount: number;
  failedCount: number;
  historyLogsPruned: number;
  projectQueued: boolean;
};

function toNumber(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function transformBalanceSheetActualsJob(
  data: TransformBalanceSheetActualsJobData
): Promise<TransformBalanceSheetActualsResult> {
  console.log("[INFO] BalanceSheetActuals transform started.", {
    companyId: data.companyId,
    organisationId: data.organisationId,
    integrationSourceId: data.integrationSourceId,
    syncRunId: data.syncRunId,
    autoProject: data.autoProject ?? true,
  });

  const transformRows = await prisma.$queryRaw<TransformBalanceSheetActualsDbResult[]>`
    SELECT *
    FROM public.fn_transform_balance_sheet_actuals(
      ${data.companyId}::uuid,
      ${data.organisationId}::uuid,
      ${data.integrationSourceId}::uuid,
      ${data.syncRunId}::uuid
    )
  `;

  const transformResult = transformRows[0];
  const insertedCount = toNumber(transformResult?.inserted_count);
  const updatedCount = toNumber(transformResult?.updated_count);
  const warningCount = toNumber(transformResult?.warning_count);
  const failedCount = toNumber(transformResult?.failed_count);

  // Retention cleanup: retain only latest 1 SUCCESS and latest 1 FAILED per property
  let historyLogsPruned = 0;
  try {
    const propertyLogs = await prisma.integrationReportApiLog.findMany({
      where: {
        companyId: data.companyId,
        organisationId: data.organisationId,
        syncRunId: data.syncRunId,
        reportName: "balance_sheet",
      },
      select: {
        sourcePropertyId: true,
      },
      distinct: ["sourcePropertyId"],
    });

    for (const propLog of propertyLogs) {
      if (!propLog.sourcePropertyId) continue;
      const deleteRows = await prisma.$queryRaw<Array<{ fn_cleanup_balance_sheet_history: number }>>`
        SELECT public.fn_cleanup_balance_sheet_history(
          ${data.companyId}::uuid,
          ${data.organisationId}::uuid,
          ${propLog.sourcePropertyId}::text
        )
      `;
      const pruned = toNumber(deleteRows[0]?.fn_cleanup_balance_sheet_history);
      historyLogsPruned += pruned;
    }

    if (historyLogsPruned > 0) {
      console.log(`[INFO] Pruned ${historyLogsPruned} historical balance_sheet report logs and orphaned staging rows.`);
    }
  } catch (cleanErr) {
    console.warn("[WARN] Failed executing history log pruning for balance sheet:", cleanErr);
  }

  let projectQueued = false;
  const shouldAutoProject = data.autoProject ?? true;

  if (shouldAutoProject) {
    await projectBalanceSheetActualsQueue.add(
      "project-balance-sheet-actuals",
      {
        companyId: data.companyId,
        organisationId: data.organisationId,
        integrationSourceId: data.integrationSourceId,
        entityName: "BalanceSheetActuals",
        syncRunId: data.syncRunId,
      },
      {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        removeOnComplete: 100,
        removeOnFail: 200,
      }
    );
    projectQueued = true;
  }

  console.log("[INFO] BalanceSheetActuals transform completed.", {
    syncRunId: data.syncRunId,
    insertedCount,
    updatedCount,
    warningCount,
    failedCount,
    historyLogsPruned,
    projectQueued,
  });

  return {
    syncRunId: data.syncRunId,
    insertedCount,
    updatedCount,
    warningCount,
    failedCount,
    historyLogsPruned,
    projectQueued,
  };
}
