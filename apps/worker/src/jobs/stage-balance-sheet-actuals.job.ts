import { prisma } from "@budget-integration/database";
import {
  transformBalanceSheetActualsQueue,
  type StageBalanceSheetActualsJobData,
} from "@budget-integration/integration-core";

type StageBalanceSheetActualsDbResult = {
  out_sync_run_id: string;
  report_logs_processed: number;
  rows_inserted_or_updated: number;
  rows_skipped: number;
};

type StageBalanceSheetActualsResult = {
  syncRunId: string;
  reportLogsProcessed: number;
  rowsInsertedOrUpdated: number;
  rowsSkipped: number;
  transformQueued: boolean;
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

export async function stageBalanceSheetActualsJob(
  data: StageBalanceSheetActualsJobData
): Promise<StageBalanceSheetActualsResult> {
  console.log("[INFO] BalanceSheetActuals staging started.", {
    companyId: data.companyId,
    organisationId: data.organisationId,
    integrationSourceId: data.integrationSourceId,
    syncRunId: data.syncRunId,
    reportLogId: data.reportLogId,
    autoTransform: data.autoTransform ?? true,
  });

  const rows = await prisma.$queryRaw<StageBalanceSheetActualsDbResult[]>`
    SELECT *
    FROM public.fn_stage_balance_sheet_actuals_from_logs(
      ${data.companyId}::uuid,
      ${data.organisationId}::uuid,
      ${data.integrationSourceId}::uuid,
      ${data.syncRunId}::uuid,
      ${data.reportLogId ? data.reportLogId : null}::uuid
    )
  `;

  const resultRow = rows[0];
  const reportLogsProcessed = toNumber(resultRow?.report_logs_processed);
  const rowsInsertedOrUpdated = toNumber(resultRow?.rows_inserted_or_updated);
  const rowsSkipped = toNumber(resultRow?.rows_skipped);

  let transformQueued = false;
  const shouldAutoTransform = data.autoTransform ?? true;

  if (shouldAutoTransform) {
    await transformBalanceSheetActualsQueue.add(
      "transform-balance-sheet-actuals",
      {
        companyId: data.companyId,
        organisationId: data.organisationId,
        integrationSourceId: data.integrationSourceId,
        entityName: "BalanceSheetActuals",
        syncRunId: data.syncRunId,
        autoProject: data.autoProject ?? true,
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
    transformQueued = true;
  }

  console.log("[INFO] BalanceSheetActuals staging completed.", {
    syncRunId: data.syncRunId,
    reportLogsProcessed,
    rowsInsertedOrUpdated,
    rowsSkipped,
    transformQueued,
  });

  return {
    syncRunId: data.syncRunId,
    reportLogsProcessed,
    rowsInsertedOrUpdated,
    rowsSkipped,
    transformQueued,
  };
}
