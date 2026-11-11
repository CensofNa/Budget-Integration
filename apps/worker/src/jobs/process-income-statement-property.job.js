import { prisma } from "@budget-integration/database";
import { stageIncomeStatementActualsJob } from "./stage-income-statement-actuals.job.js";
import { transformIncomeStatementActualsJob } from "./transform-income-statement-actuals.job.js";
import { projectIncomeStatementActualsJob } from "./project-income-statement-actuals.job.js";
export async function processIncomeStatementPropertyJob(data) {
    console.log("[INFO] processIncomeStatementPropertyJob starting.", {
        companyId: data.companyId,
        organisationId: data.organisationId,
        syncRunId: data.syncRunId,
        sourcePropertyId: data.sourcePropertyId,
        fiscalYear: data.fiscalYear
    });
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
        throw new Error(`No IntegrationReportApiLog found for syncRunId: ${data.syncRunId} and property: ${data.sourcePropertyId}`);
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
    // Post-projection fix: align coaId and accountGroup on the projected ACTUALS lines using fn_get_coa_for_property
    if (data.propertyId) {
        console.log("[INFO] Starting post-projection coa_id and accountGroup alignment for ACTUALS...");
        const propertyId = data.propertyId;
        const actualsSnapshots = await prisma.budgetSnapshot.findMany({
            where: {
                propertyId,
                snapshotType: "ACTUALS"
            },
            select: {
                snapshotId: true
            }
        });
        for (const snap of actualsSnapshots) {
            const coaAccounts = await prisma.$queryRaw `
        SELECT coa_id, account_code, group_name 
        FROM public.fn_get_coa_for_property(
          ${data.companyId}::uuid, 
          ${data.organisationId}::uuid, 
          ${propertyId}::uuid
        )
      `;
            const coaMap = new Map();
            for (const coa of coaAccounts) {
                coaMap.set(coa.account_code, {
                    id: coa.coa_id,
                    groupName: coa.group_name ?? ""
                });
            }
            const lines = await prisma.budgetCalcLine.findMany({
                where: {
                    snapshotId: snap.snapshotId
                },
                select: {
                    calcLineId: true,
                    accountCode: true
                }
            });
            for (const line of lines) {
                if (!line.accountCode) {
                    continue;
                }
                const coaInfo = coaMap.get(line.accountCode);
                if (coaInfo) {
                    await prisma.budgetCalcLine.update({
                        where: {
                            calcLineId: line.calcLineId
                        },
                        data: {
                            coaId: coaInfo.id,
                            accountGroup: coaInfo.groupName
                        }
                    });
                }
                else {
                    await prisma.budgetCalcLine.update({
                        where: {
                            calcLineId: line.calcLineId
                        },
                        data: {
                            coaId: null,
                            accountGroup: null
                        }
                    });
                }
            }
        }
        console.log("[INFO] Post-projection alignment completed successfully.");
    }
    // 4.5 If updateReforecast is true, sync projected actuals to REFORECAST with the cutoff month
    if (data.updateReforecast && data.propertyId) {
        const cutoffMonth = data.reforecastCutoffMonth ?? "2026-06";
        console.log(`[INFO] Syncing actuals to REFORECAST for property ${data.propertyId} with cutoff month: ${cutoffMonth}...`);
        try {
            await prisma.$queryRawUnsafe(`
        SELECT * FROM public.fn_sync_actuals_to_reforecast(
          \${data.companyId}::uuid,
          \${data.organisationId}::uuid,
          \${data.propertyId}::uuid,
          \${data.fiscalYear}::integer,
          null::uuid,
          \${cutoffMonth}::varchar
        )
      `);
            console.log("[INFO] REFORECAST sync completed successfully.");
        }
        catch (reforecastError) {
            console.error("[ERROR] Failed to sync actuals to REFORECAST:", reforecastError);
        }
    }
    // 4.6 Reset isGlLockedChanged on propertyClosingStatus once actuals are processed
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
    if (resolvedPropertyId) {
        try {
            await prisma.propertyClosingStatus.updateMany({
                where: {
                    propertyId: resolvedPropertyId,
                    isGlLockedChanged: true,
                },
                data: {
                    isGlLockedChanged: false,
                },
            });
            console.log(`[INFO] Reset isGlLockedChanged to false for property ${resolvedPropertyId}`);
        }
        catch (resetErr) {
            console.error("[WARN] Failed to reset isGlLockedChanged on propertyClosingStatus:", resetErr);
        }
    }
    // 5. Update the IntegrationSyncRun status to COMPLETED
    await prisma.integrationSyncRun.update({
        where: {
            id: data.syncRunId
        },
        data: {
            status: "COMPLETED",
            recordsProcessed: stageResult.rowsInsertedOrUpdated + stageResult.rowsSkipped,
            recordsFailed: 0,
            completedAt: new Date()
        }
    });
    console.log(`[INFO] Sync Run ${data.syncRunId} status set to COMPLETED.`);
    return {
        stage: stageResult,
        transform: transformResult,
        project: projectResult
    };
}
//# sourceMappingURL=process-income-statement-property.job.js.map