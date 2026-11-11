import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";

import {
  asArray,
  asObject,
  createSourceHash,
  getCredentialValue,
  getNumberFromJson,
  getSecretManager,
  getString,
  IntegrationError,
  type JsonObject
} from "@budget-integration/integration-core";

import { EntrataGlTreesConnector } from "@budget-integration/connector-entrata";

export interface SyncEntrataGlTreesJobInput {
  companyId?: string;
  organisationId?: string;
  integrationSourceId?: string;
  entityName?: "GlTree";
}

export interface SyncEntrataGlTreesJobResult {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
  syncRunId: string;
  stagingBatchId: string;
  recordsReceived: number;
  recordsStaged: number;
  recordsSkipped: number;
  recordsPendingTransform: number;
}

function throwConfigError(
  message: string,
  code: string,
  context: Record<string, unknown>
): never {
  throw new IntegrationError({
    message,
    code,
    category: "CONFIGURATION_ERROR",
    retryable: false,
    severity: "ERROR",
    context
  });
}

function getGlTrees(response: unknown): JsonObject[] {
  const root = asObject(response);
  const responseObj = asObject(root.response);
  const resultObj = asObject(responseObj.result);

  const lowerContainer = asObject(resultObj.glTrees);
  const upperContainer = asObject(resultObj.GlTrees);

  return asArray(
    lowerContainer.glTree ??
      upperContainer.GlTree ??
      resultObj.glTree ??
      resultObj.GlTree
  );
}

function getBranches(glTree: JsonObject): JsonObject[] {
  const branchesObj = asObject(glTree.branches ?? glTree.Branches);

  return asArray(
    branchesObj.branch ??
      branchesObj.Branch
  );
}

function getAccounts(glTree: JsonObject): JsonObject[] {
  const accountsObj = asObject(glTree.glAccounts ?? glTree.GlAccounts);

  return asArray(
    accountsObj.glAccount ??
      accountsObj.GlAccount
  );
}

async function stageGlTreeRecord(input: {
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
  syncRunId: string;
  stagingBatchId: string;

  recordType: "TREE" | "BRANCH" | "ACCOUNT";

  sourceGlTreeId?: string | null;
  sourceBranchId?: string | null;
  sourceGlAccountId?: string | null;

  sourceRecordId: string;
  sourceHash: string;
  rawPayloadJson: unknown;

  isUnchanged: boolean;
}): Promise<void> {
  await prisma.stagingGlTree.upsert({
    where: {
      companyId_organisationId_integrationSourceId_sourceRecordId: {
        companyId: input.companyId,
        organisationId: input.organisationId,
        integrationSourceId: input.integrationSourceId,
        sourceRecordId: input.sourceRecordId
      }
    },
    update: {
      syncRunId: input.syncRunId,
      stagingBatchId: input.stagingBatchId,

      recordType: input.recordType,

      sourceGlTreeId: input.sourceGlTreeId ?? null,
      sourceBranchId: input.sourceBranchId ?? null,
      sourceGlAccountId: input.sourceGlAccountId ?? null,

      sourceHash: input.sourceHash,
      rawPayloadJson: input.rawPayloadJson as Prisma.InputJsonValue,

      validationStatus: input.isUnchanged ? "VALID" : "PENDING",
      transformStatus: input.isUnchanged ? "SKIPPED" : "PENDING",

      validationErrors: Prisma.JsonNull,
      transformErrors: Prisma.JsonNull,

      transformedAt: input.isUnchanged ? new Date() : null,
      updatedAt: new Date()
    },
    create: {
      companyId: input.companyId,
      organisationId: input.organisationId,
      integrationSourceId: input.integrationSourceId,
      syncRunId: input.syncRunId,
      stagingBatchId: input.stagingBatchId,

      recordType: input.recordType,

      sourceGlTreeId: input.sourceGlTreeId ?? null,
      sourceBranchId: input.sourceBranchId ?? null,
      sourceGlAccountId: input.sourceGlAccountId ?? null,

      sourceRecordId: input.sourceRecordId,
      sourceHash: input.sourceHash,
      rawPayloadJson: input.rawPayloadJson as Prisma.InputJsonValue,

      validationStatus: input.isUnchanged ? "VALID" : "PENDING",
      transformStatus: input.isUnchanged ? "SKIPPED" : "PENDING",

      validationErrors: Prisma.JsonNull,
      transformErrors: Prisma.JsonNull,

      transformedAt: input.isUnchanged ? new Date() : null
    }
  });
}

export async function syncEntrataGlTreesJob(
  input: SyncEntrataGlTreesJobInput = {}
): Promise<SyncEntrataGlTreesJobResult | null> {
  const source = await prisma.integrationSource.findFirst({
    where: {
      ...(input.companyId ? { companyId: input.companyId } : {}),
      ...(input.organisationId ? { organisationId: input.organisationId } : {}),
      ...(input.integrationSourceId ? { id: input.integrationSourceId } : {}),

      sourceType: "entrata",
      isActive: true,

      entities: {
        some: {
          entityName: "GlTree",
          isEnabled: true
        }
      }
    },
    include: {
      config: true,
      entities: {
        where: {
          entityName: "GlTree",
          isEnabled: true
        }
      }
    }
  });

  if (!source || !source.config) {
    console.log("No active Entrata GL Tree source found.");
    return null;
  }

  const entityConfig = source.entities[0];
  const syncSettings = entityConfig?.syncSettingsJson as JsonObject | null;
  const credentials = source.config.credentialsJson as JsonObject | null;
  const connection = source.config.connectionJson as JsonObject | null;

  const apiKeyValue = getCredentialValue(credentials, "apiKey");
  const apiKeyRef = getCredentialValue(credentials, "apiKeyRef");

  const apiKey =
    apiKeyValue ??
    (apiKeyRef
      ? await getSecretManager().getSecret(apiKeyRef)
      : undefined);

  if (!apiKey) {
    throwConfigError(
      "Entrata API key is not configured.",
      "ENTRATA_API_KEY_MISSING",
      {
        companyId: source.companyId,
        organisationId: source.organisationId,
        integrationSourceId: source.id,
        entityName: "GlTree"
      }
    );
  }

  const baseUrl =
    getString(connection?.baseUrl) ??
    "https://apis.entrata.com";

  const orgSlug = getString(connection?.orgSlug);

  if (!orgSlug) {
    throwConfigError(
      "Entrata orgSlug is missing in IntegrationSourceConfig.connectionJson.",
      "ENTRATA_ORG_SLUG_MISSING",
      {
        companyId: source.companyId,
        organisationId: source.organisationId,
        integrationSourceId: source.id,
        entityName: "GlTree"
      }
    );
  }

  const connector = new EntrataGlTreesConnector(
    {
      baseUrl,
      orgSlug,
      minDelayMs: getNumberFromJson(syncSettings?.minDelayMs, 1200)
    },
    {
      apiKey
    }
  );

  const glTreeId = getString(syncSettings?.glTreeId) ?? "";
  const glBranchId = getString(syncSettings?.glBranchId) ?? "";
  const glGroupTypeId = getString(syncSettings?.glGroupTypeId) ?? "";
  const glTreeTypeId = getString(syncSettings?.glTreeTypeId) ?? "";
  const accountNumbers = getString(syncSettings?.accountNumbers) ?? "";

  const syncRun = await prisma.integrationSyncRun.create({
    data: {
      companyId: source.companyId,
      organisationId: source.organisationId,
      integrationSourceId: source.id,
      entityName: "GlTree",
      syncType: "GL_TREE_SYNC",
      status: "STARTED",
      requestId: `entrata-gl-trees-${Date.now()}`
    }
  });

  const requestId = `entrata-gl-trees-r2-${Date.now()}`;

  const stagingBatch = await prisma.stagingApiBatch.create({
    data: {
      companyId: source.companyId,
      organisationId: source.organisationId,
      integrationSourceId: source.id,
      syncRunId: syncRun.id,

      entityName: "GlTree",
      sourceMethod: "getGlTrees",
      requestId,
      responseCode: 0,

      rawRequest: {
        method: "getGlTrees",
        version: "r2",
        glTreeId,
        glBranchId,
        glGroupTypeId,
        glTreeTypeId,
        accountNumbers
      } as Prisma.InputJsonValue,

      rawResponse: Prisma.JsonNull,
      status: "STARTED"
    }
  });

  let totalReceived = 0;
  let totalStaged = 0;
  let totalSkipped = 0;
  let totalPendingTransform = 0;

  try {
    console.log("Calling Entrata getGlTrees r2.", {
      requestId,
      glTreeId,
      glBranchId,
      glGroupTypeId,
      glTreeTypeId,
      accountNumbers
    });

    const response = await connector.fetchGlTrees({
      requestId,
      glTreeId,
      glBranchId,
      glGroupTypeId,
      glTreeTypeId,
      accountNumbers,
      timeoutMs: getNumberFromJson(syncSettings?.timeoutMs, 60000),
      maxRetries: getNumberFromJson(syncSettings?.maxRetries, 2),
      retryBaseDelayMs: getNumberFromJson(
        syncSettings?.retryBaseDelayMs,
        60000
      )
    });

    await prisma.stagingApiBatch.update({
      where: {
        id: stagingBatch.id
      },
      data: {
        responseCode: 200,
        rawResponse: response as Prisma.InputJsonValue,
        status: "RECEIVED"
      }
    });

    const glTrees = getGlTrees(response);

    for (const glTreeRaw of glTrees) {
      const glTree = asObject(glTreeRaw);

      const sourceGlTreeId =
        getString(glTree.id) ??
        getString(glTree.glTreeId);

      if (!sourceGlTreeId) {
        continue;
      }

      const treePayload = glTree;
      const treeRecordId = `TREE:${sourceGlTreeId}`;
      const treeHash = createSourceHash(treePayload);

      const existingTreeMap = await prisma.sourceRecordMap.findUnique({
        where: {
          companyId_organisationId_integrationSourceId_entityName_sourceRecordId: {
            companyId: source.companyId,
            organisationId: source.organisationId,
            integrationSourceId: source.id,
            entityName: "GlTree",
            sourceRecordId: treeRecordId
          }
        }
      });

      const treeUnchanged = existingTreeMap?.sourceHash === treeHash;

      await stageGlTreeRecord({
        companyId: source.companyId,
        organisationId: source.organisationId,
        integrationSourceId: source.id,
        syncRunId: syncRun.id,
        stagingBatchId: stagingBatch.id,

        recordType: "TREE",

        sourceGlTreeId,
        sourceRecordId: treeRecordId,
        sourceHash: treeHash,
        rawPayloadJson: treePayload,

        isUnchanged: treeUnchanged
      });

      totalReceived++;
      totalStaged++;

      if (treeUnchanged) {
        totalSkipped++;
      } else {
        totalPendingTransform++;
      }

      const branches = getBranches(glTree);

      for (const branchRaw of branches) {
        const branch = asObject(branchRaw);

        const sourceBranchId =
          getString(branch.branchId) ??
          getString(branch.id);

        if (!sourceBranchId) {
          continue;
        }

        const branchPayload = {
          sourceGlTreeId,
          ...branch
        };

        const branchRecordId =
          `BRANCH:${sourceGlTreeId}:${sourceBranchId}`;

        const branchHash = createSourceHash(branchPayload);

        const existingBranchMap = await prisma.sourceRecordMap.findUnique({
          where: {
            companyId_organisationId_integrationSourceId_entityName_sourceRecordId: {
              companyId: source.companyId,
              organisationId: source.organisationId,
              integrationSourceId: source.id,
              entityName: "GlTree",
              sourceRecordId: branchRecordId
            }
          }
        });

        const branchUnchanged =
          existingBranchMap?.sourceHash === branchHash;

        await stageGlTreeRecord({
          companyId: source.companyId,
          organisationId: source.organisationId,
          integrationSourceId: source.id,
          syncRunId: syncRun.id,
          stagingBatchId: stagingBatch.id,

          recordType: "BRANCH",

          sourceGlTreeId,
          sourceBranchId,
          sourceRecordId: branchRecordId,
          sourceHash: branchHash,
          rawPayloadJson: branchPayload,

          isUnchanged: branchUnchanged
        });

        totalReceived++;
        totalStaged++;

        if (branchUnchanged) {
          totalSkipped++;
        } else {
          totalPendingTransform++;
        }
      }

      const accounts = getAccounts(glTree);

      for (const accountRaw of accounts) {
        const account = asObject(accountRaw);

        const sourceGlAccountId = getString(account.id);
        const sourceBranchId = getString(account.branchId);

        if (!sourceGlAccountId) {
          continue;
        }

        const accountPayload = {
          sourceGlTreeId,
          ...account
        };

        const accountRecordId =
          `ACCOUNT:${sourceGlTreeId}:${sourceGlAccountId}`;

        const accountHash = createSourceHash(accountPayload);

        const existingAccountMap = await prisma.sourceRecordMap.findUnique({
          where: {
            companyId_organisationId_integrationSourceId_entityName_sourceRecordId: {
              companyId: source.companyId,
              organisationId: source.organisationId,
              integrationSourceId: source.id,
              entityName: "GlTree",
              sourceRecordId: accountRecordId
            }
          }
        });

        const accountUnchanged =
          existingAccountMap?.sourceHash === accountHash;

        await stageGlTreeRecord({
          companyId: source.companyId,
          organisationId: source.organisationId,
          integrationSourceId: source.id,
          syncRunId: syncRun.id,
          stagingBatchId: stagingBatch.id,

          recordType: "ACCOUNT",

          sourceGlTreeId,
          sourceBranchId: sourceBranchId ?? null,
          sourceGlAccountId,
          sourceRecordId: accountRecordId,
          sourceHash: accountHash,
          rawPayloadJson: accountPayload,

          isUnchanged: accountUnchanged
        });

        totalReceived++;
        totalStaged++;

        if (accountUnchanged) {
          totalSkipped++;
        } else {
          totalPendingTransform++;
        }
      }
    }

    await prisma.stagingApiBatch.update({
      where: {
        id: stagingBatch.id
      },
      data: {
        status: "PARSED"
      }
    });

    await prisma.integrationSyncRun.update({
      where: {
        id: syncRun.id
      },
      data: {
        status:
          totalPendingTransform > 0
            ? "STAGED"
            : "COMPLETED",
        recordsReceived: totalReceived,
        recordsStaged: totalStaged,
        recordsProcessed: totalSkipped,
        recordsFailed: 0,
        completedAt: new Date()
      }
    });

    console.log(
      `Entrata GL Tree r2 sync completed. Received: ${totalReceived}, Staged: ${totalStaged}, Skipped: ${totalSkipped}, Pending transform: ${totalPendingTransform}.`
    );

    return {
      companyId: source.companyId,
      organisationId: source.organisationId,
      integrationSourceId: source.id,
      syncRunId: syncRun.id,
      stagingBatchId: stagingBatch.id,
      recordsReceived: totalReceived,
      recordsStaged: totalStaged,
      recordsSkipped: totalSkipped,
      recordsPendingTransform: totalPendingTransform
    };
  } catch (error) {
    await prisma.stagingApiBatch.update({
      where: {
        id: stagingBatch.id
      },
      data: {
        status: "FAILED",
        rawResponse: {
          error:
            error instanceof Error
              ? error.message
              : String(error)
        } as Prisma.InputJsonValue
      }
    });

    await prisma.integrationSyncRun.update({
      where: {
        id: syncRun.id
      },
      data: {
        status: "FAILED",
        errorMessage:
          error instanceof Error
            ? error.message
            : String(error),
        completedAt: new Date()
      }
    });

    throw error;
  }
}