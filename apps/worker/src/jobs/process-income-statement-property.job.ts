import { prisma } from "@budget-integration/database";
import { stageIncomeStatementActualsJob } from "./stage-income-statement-actuals.job.js";
import { transformIncomeStatementActualsJob } from "./transform-income-statement-actuals.job.js";
import { projectIncomeStatementActualsJob } from "./project-income-statement-actuals.job.js";

function parseMonthNumber(monthStr?: string | null): number | null {
  if (!monthStr) return null;
  const trimmed = monthStr.trim();
  const yyyyMmMatch = trimmed.match(/^\d{4}-(\d{1,2})/);
  if (yyyyMmMatch && yyyyMmMatch[1]) {
    const m = parseInt(yyyyMmMatch[1], 10);
    return m >= 1 && m <= 12 ? m : null;
  }
  const mmYyyyMatch = trimmed.match(/^(\d{1,2})\/\d{4}/);
  if (mmYyyyMatch && mmYyyyMatch[1]) {
    const m = parseInt(mmYyyyMatch[1], 10);
    return m >= 1 && m <= 12 ? m : null;
  }
  const singleNum = parseInt(trimmed, 10);
  if (!Number.isNaN(singleNum) && singleNum >= 1 && singleNum <= 12) {
    return singleNum;
  }
  return null;
}

export interface ProcessIncomeStatementPropertyJobData {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
  syncRunId: string;
  sourcePropertyId: string;
  propertyId?: string;
  propertyCode?: string;
  fiscalYear: number;
  updateReforecast?: boolean;
  reforecastCutoffMonth?: string;
}

export async function processIncomeStatementPropertyJob(
  data: ProcessIncomeStatementPropertyJobData
): Promise<any> {
  console.log("[INFO] processIncomeStatementPropertyJob starting.", {
    companyId: data.companyId,
    organisationId: data.organisationId,
    syncRunId: data.syncRunId,
    sourcePropertyId: data.sourcePropertyId,
    fiscalYear: data.fiscalYear
  });

  await prisma.integrationPropertyProcessRun.updateMany({
    where: {
      syncRunId: data.syncRunId,
      sourcePropertyId: data.sourcePropertyId,
    },
    data: {
      status: "PROCESSING",
      startedAt: new Date(),
    },
  }).catch(() => undefined);

  // 1. Resolve the reportLogId from the api log table
  const log = await prisma.integrationReportApiLog.findFirst({
    where: {
      syncRunId: data.syncRunId,
      sourcePropertyId: data.sourcePropertyId
    },
    select: {
      id: true
    }
  });

  if (!log) {
    throw new Error(
      `No IntegrationReportApiLog found for syncRunId: ${data.syncRunId} and property: ${data.sourcePropertyId}`
    );
  }

  console.log(`[INFO] Resolved Report Log ID: ${log.id}. Starting Staging...`);

  // 2. Stage the report data
  const stageResult = await stageIncomeStatementActualsJob({
    companyId: data.companyId,
    organisationId: data.organisationId,
    integrationSourceId: data.integrationSourceId,
    syncRunId: data.syncRunId,
    reportLogId: log.id,
    entityName: "IncomeStatementActuals"
  });

  console.log("[INFO] Staging completed successfully.", stageResult);
  await prisma.integrationPropertyProcessRun.updateMany({
    where: {
      syncRunId: data.syncRunId,
      sourcePropertyId: data.sourcePropertyId,
    },
    data: {
      transformStatus: "STAGED",
      rowsProcessed: stageResult.rowsInsertedOrUpdated,
    },
  }).catch(() => undefined);

  // 3. Transform the staged report data
  const transformResult = await transformIncomeStatementActualsJob({
    companyId: data.companyId,
    organisationId: data.organisationId,
    integrationSourceId: data.integrationSourceId,
    syncRunId: data.syncRunId,
    entityName: "IncomeStatementActuals",
    autoProject: false
  });

  console.log("[INFO] Transformation completed successfully.", transformResult);
  await prisma.integrationPropertyProcessRun.updateMany({
    where: {
      syncRunId: data.syncRunId,
      sourcePropertyId: data.sourcePropertyId,
    },
    data: {
      transformStatus: "TRANSFORMED",
      actualRowsUpserted: transformResult.insertedCount + transformResult.updatedCount,
    },
  }).catch(() => undefined);

  // 4. Project the actuals
  const projectResult = await projectIncomeStatementActualsJob({
    companyId: data.companyId,
    organisationId: data.organisationId,
    integrationSourceId: data.integrationSourceId,
    syncRunId: data.syncRunId,
    entityName: "IncomeStatementActuals",
    ...(data.propertyId ? { propertyId: data.propertyId } : {})
  });

  console.log("[INFO] Projection completed successfully.", projectResult);
  await prisma.integrationPropertyProcessRun.updateMany({
    where: {
      syncRunId: data.syncRunId,
      sourcePropertyId: data.sourcePropertyId,
    },
    data: {
      status: "COMPLETED",
      projectStatus: "PROJECTED",
      calcLinesUpserted: (projectResult?.results?.[0]?.calcLinesUpserted) ?? 0,
      completedAt: new Date(),
    },
  }).catch(() => undefined);

  // 4.6 Resolve propertyId if not already provided
  const extId = data.propertyCode ? Number(data.propertyCode) : NaN;
  const resolvedPropertyId = data.propertyId ?? (data.propertyCode ? (await prisma.property.findFirst({
    where: {
      companyId: data.companyId,
      organisationId: data.organisationId,
      OR: [
        { code: data.propertyCode },
        ...(!Number.isNaN(extId) ? [{ externalId: extId }] : []),
      ]
    },
    select: { id: true }
  }))?.id : undefined);

  const targetPropertyId = data.propertyId ?? resolvedPropertyId;

  // 4.5 If updateReforecast is true, sync projected actuals to REFORECAST with the cutoff month
  // and update property.reforecast_locked_till_month within a single transaction
  if ((data.updateReforecast || data.reforecastCutoffMonth) && targetPropertyId) {
    const rawCutoff = data.reforecastCutoffMonth ?? "2026-06";
    const cutoffMonth = rawCutoff.length > 7 && rawCutoff.includes("-") ? rawCutoff.slice(0, 7) : rawCutoff;
    const lockedMonthNumber = parseMonthNumber(rawCutoff);

    console.log(`[INFO] Syncing actuals to REFORECAST and updating reforecast_locked_till_month for property ${targetPropertyId} (cutoffMonth: ${cutoffMonth}, lockedMonth: ${lockedMonthNumber})...`);
    try {
      await prisma.$transaction(async (tx) => {
        // Step 1: Execute fn_sync_actuals_to_reforecast
        await tx.$queryRawUnsafe(`
          SELECT * FROM public.fn_sync_actuals_to_reforecast(
            $1::uuid,
            $2::uuid,
            $3::uuid,
            $4::integer,
            null::uuid,
            $5::varchar
          )
        `, data.companyId, data.organisationId, targetPropertyId, data.fiscalYear, cutoffMonth);

        // Step 2: Update reforecast_locked_till_month on property
        if (lockedMonthNumber !== null) {
          await tx.property.update({
            where: { id: targetPropertyId },
            data: {
              reforecastLockedTillMonth: lockedMonthNumber,
              updatedAt: new Date(),
            },
          });
          console.log(`[INFO] Successfully updated property ${targetPropertyId} reforecastLockedTillMonth to ${lockedMonthNumber}`);
        }
      });
      console.log("[INFO] REFORECAST sync and lock transaction completed successfully.");
    } catch (reforecastError) {
      console.error("[ERROR] Failed to sync actuals to REFORECAST / update reforecast_locked_till_month in transaction:", reforecastError);
    }
  }

  // Reset isGlLockedChanged on propertyClosingStatus once actuals are processed
  try {
    const orConditions: any[] = [];
    if (resolvedPropertyId) orConditions.push({ propertyId: resolvedPropertyId });
    if (data.sourcePropertyId) orConditions.push({ sourceRecordId: data.sourcePropertyId });
    if (data.propertyCode) orConditions.push({ sourceRecordId: data.propertyCode });

    if (orConditions.length > 0) {
      await prisma.propertyClosingStatus.updateMany({
        where: {
          companyId: data.companyId,
          organisationId: data.organisationId,
          isGlLockedChanged: true,
          OR: orConditions,
        },
        data: {
          isGlLockedChanged: false,
          ...(resolvedPropertyId ? { propertyId: resolvedPropertyId } : {}),
        },
      });
      console.log(`[INFO] Reset isGlLockedChanged to false for property (id: ${resolvedPropertyId ?? "null"}, sourcePropertyId: ${data.sourcePropertyId})`);
    }
  } catch (resetErr) {
    console.error("[WARN] Failed to reset isGlLockedChanged on propertyClosingStatus:", resetErr);
  }

  // Check if all properties for this syncRun are finished; if so, update IntegrationSyncRun
  const pendingOrProcessingCount = await prisma.integrationPropertyProcessRun.count({
    where: {
      syncRunId: data.syncRunId,
      status: { in: ["PENDING", "QUEUED", "PROCESSING"] },
    },
  });

  if (pendingOrProcessingCount === 0) {
    const failedRuns = await prisma.integrationPropertyProcessRun.count({
      where: {
        syncRunId: data.syncRunId,
        status: "FAILED",
      },
    });

    await prisma.integrationSyncRun.update({
      where: { id: data.syncRunId },
      data: {
        status: failedRuns > 0 ? "PARTIAL_FAILED" : "COMPLETED",
        completedAt: new Date(),
      },
    }).catch(() => undefined);
    console.log(`[INFO] All properties processed. Sync Run ${data.syncRunId} marked COMPLETED.`);
  }

  return {
    stage: stageResult,
    transform: transformResult,
    project: projectResult
  };
}
