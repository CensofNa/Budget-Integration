import { prisma } from "@budget-integration/database";
import { projectIncomeStatementActualsQueue, } from "@budget-integration/integration-core";
function buildJobId(...parts) {
    return parts
        .filter((part) => part !== null && part !== undefined && String(part).trim() !== "")
        .map((part) => String(part)
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, "_"))
        .join("_");
}
function toNumber(value) {
    if (value === null || value === undefined) {
        return 0;
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : 0;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}
export async function transformIncomeStatementActualsJob(data) {
    console.log("[INFO] IncomeStatementActuals transform started.", {
        companyId: data.companyId,
        organisationId: data.organisationId,
        integrationSourceId: data.integrationSourceId,
        syncRunId: data.syncRunId,
        autoProject: data.autoProject ?? false,
    });
    /*
      This function should:
        1. Read staging_income_statement_actuals for the sync_run_id.
        2. Resolve property using property_id/property_code/source_property_id.
        3. Resolve account if available in chart of accounts / gl_accounts.
        4. Insert/update property_budget_actuals.
        5. If account is missing, still transform using account_number/account_name.
        6. Create integration_data_notifications for missing accounts.
        7. Mark staging rows TRANSFORMED / TRANSFORMED_WITH_WARNING / FAILED.
  
      Expected SQL function signature:
  
        public.fn_transform_income_statement_actuals(
          p_company_id uuid,
          p_organisation_id uuid,
          p_integration_source_id uuid,
          p_sync_run_id uuid
        )
  
      Expected return columns:
  
        inserted_count integer
        updated_count integer
        warning_count integer
        failed_count integer
    */
    const transformRows = await prisma.$queryRaw `
    SELECT *
    FROM public.fn_transform_income_statement_actuals(
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
    let projectQueued = false;
    if (data.autoProject) {
        const projectJob = await projectIncomeStatementActualsQueue.add("project-income-statement-actuals", {
            companyId: data.companyId,
            organisationId: data.organisationId,
            integrationSourceId: data.integrationSourceId,
            entityName: "IncomeStatementActuals",
            syncRunId: data.syncRunId,
        }, {
            attempts: 3,
            backoff: {
                type: "exponential",
                delay: 5000,
            },
            removeOnComplete: 100,
            removeOnFail: 1000,
            jobId: buildJobId("project-income-statement-actuals", data.integrationSourceId, data.syncRunId, Date.now()),
        });
        projectQueued = !!projectJob.id;
        console.log("[INFO] IncomeStatementActuals project job queued.", {
            syncRunId: data.syncRunId,
            projectJobId: projectJob.id,
        });
    }
    console.log("[INFO] IncomeStatementActuals transform completed.", {
        syncRunId: data.syncRunId,
        insertedCount,
        updatedCount,
        warningCount,
        failedCount,
        projectQueued,
    });
    return {
        syncRunId: data.syncRunId,
        insertedCount,
        updatedCount,
        warningCount,
        failedCount,
        projectQueued,
    };
}
//# sourceMappingURL=transform-income-statement-actuals.job.js.map