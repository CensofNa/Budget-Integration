import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";
import { getReportTransformer } from "@budget-integration/domain-rent";

export interface TransformStagedReportDataJobInput {
  companyId?: string;
  organisationId?: string;
  integrationSourceId?: string;
  syncRunId?: string;
  reportRunId?: string;
  reportCode?: string;
  batchSize?: number;

  /**
   * false/default = transform only PENDING rows.
   * true = retry both PENDING and FAILED staging rows.
   */
  retryFailedRows?: boolean;
}

export async function transformStagedReportDataJob(
  input: TransformStagedReportDataJobInput = {}
): Promise<{ transformed: number; failed: number }> {
  const batchSize = input.batchSize ?? 100;

  let totalTransformed = 0;
  let totalFailed = 0;
  let totalRecords = 0;

  /*
   * Keep track of row IDs that failed during this invocation. This prevents an endless
   * loop when retryFailedRows = true and a row fails again, because it remains
   * FAILED in the database and would otherwise be fetched again immediately.
   * Successfully transformed rows become TRANSFORMED and are excluded automatically.
   */
  const failedRowIds = new Set<string>();

  const propertiesCache = new Map<
    string,
    Array<{
      id: string;
      code: string | null;
      externalId: number | null;
      name: string | null;
      fiscalYearStartMonth: number | null;
      reforecastLockedTillMonth: number | null;
    }>
  >();

  async function getCachedProperties(companyId: string, organisationId: string) {
    const key = `${companyId}:${organisationId}`;
    let cached = propertiesCache.get(key);
    if (!cached) {
      cached = await prisma.property.findMany({
        where: {
          companyId,
          organisationId,
          isDisabled: false,
        },
        select: {
          id: true,
          code: true,
          externalId: true,
          name: true,
          fiscalYearStartMonth: true,
          reforecastLockedTillMonth: true,
        },
      });
      propertiesCache.set(key, cached);
    }
    return cached;
  }

  while (true) {
    const rows = await prisma.stagingReportData.findMany({
      where: {
        ...(failedRowIds.size > 0
          ? { id: { notIn: Array.from(failedRowIds) } }
          : {}),
        ...(input.companyId ? { companyId: input.companyId } : {}),
        ...(input.organisationId ? { organisationId: input.organisationId } : {}),
        ...(input.integrationSourceId
          ? { integrationSourceId: input.integrationSourceId }
          : {}),
        ...(input.syncRunId ? { syncRunId: input.syncRunId } : {}),
        ...(input.reportRunId ? { reportRunId: input.reportRunId } : {}),
        ...(input.reportCode ? { reportCode: input.reportCode } : {}),
        validationStatus: { in: ["PENDING", "VALID"] },
        transformStatus: input.retryFailedRows
          ? { in: ["PENDING", "FAILED"] }
          : "PENDING"
      },
      include: {
        stagingBatch: {
          select: {
            rawRequest: true,
          },
        },
      },
      orderBy: {
        stagedAt: "asc"
      },
      take: batchSize
    });

    if (rows.length === 0) break;

    totalRecords += rows.length;

    for (const row of rows) {
      try {
        const transformer = getReportTransformer(row.reportCode);

        if (!transformer) {
          throw new Error(`No transformer registered for reportCode: ${row.reportCode}`);
        }

        console.log(`Transforming staged report data with id: ${row.id} using transformer for reportCode: ${row.reportCode}`);

        const cachedProperties = await getCachedProperties(
          row.companyId,
          row.organisationId,
        );

        await transformer(prisma, {
          stagingReportDataId: row.id,
          companyId: row.companyId,
          organisationId: row.organisationId,
          integrationSourceId: row.integrationSourceId,
          reportCode: row.reportCode,
          sourceRecordId: row.sourceRecordId,
          sourceHash: row.sourceHash,
          rawRecordPayload: row.rawRecordPayload as Prisma.JsonValue,
          rawRequest: row.stagingBatch?.rawRequest,
          cachedProperties,
        });

        totalTransformed++;
        console.log(`Transformed staged report: ${totalTransformed}/${totalRecords}`);
      } catch (error) {
        failedRowIds.add(row.id);
        totalFailed++;
        console.log(`Failed to transform staged report data with id: ${row.id}. Error: ${error instanceof Error ? error.message : String(error)}. Total failed: ${totalFailed}/${totalRecords}`);
        await prisma.stagingReportData.update({
          where: { id: row.id },
          data: {
            /*
             * Do not mark the row INVALID for transform errors.
             *
             * Some failures are retryable, for example missing property mapping or a
             * temporary database issue. Keeping validationStatus as VALID allows us to
             * reset/retry FAILED rows later without re-staging from Entrata.
             */
            transformStatus: "FAILED",
            transformErrors: {
              message: error instanceof Error ? error.message : String(error),
              reportCode: row.reportCode,
              sourceRecordId: row.sourceRecordId,
              failedAt: new Date().toISOString()
            }
          }
        });
      }
    }
  }

  if (input.reportRunId) {
    await prisma.integrationReportRun.update({
      where: { id: input.reportRunId },
      data: {
        recordsTransformed: totalTransformed,
        recordsFailed: totalFailed,
        status: totalFailed > 0 ? "PARTIAL_FAILED" : "TRANSFORMED"
      }
    });
  }

  console.log(`[TRANSFORM COMPLETE] Finished report data transformation for reportCode: ${input.reportCode ?? "all"}. Transformed: ${totalTransformed}, Failed: ${totalFailed}`);

  return {
    transformed: totalTransformed,
    failed: totalFailed
  };
}