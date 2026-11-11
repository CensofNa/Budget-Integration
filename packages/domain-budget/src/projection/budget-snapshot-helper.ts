import { Prisma, PrismaClient } from "@prisma/client";

type BudgetDbClient = PrismaClient | Prisma.TransactionClient;

export type BudgetSnapshotType =
  | "WORKING_BUDGET"
  | "BUDGET"
  | "ACTUALS";

export interface EnsureBudgetSnapshotInput {
  companyId: string;
  organisationId: string;
  propertyId: string;
  fiscalYear: number;
  snapshotType: BudgetSnapshotType;
  status: string;
  sourceSystem?: string | null;
}

export interface EnsureBudgetSnapshotResult {
  snapshotId: string;
  wasCreated: boolean;
}

/**
 * Ensures that a budget snapshot exists for a given
 * property + fiscal year + snapshot type.
 *
 * Important:
 * - If snapshot already exists, it is returned as-is.
 * - If snapshot does not exist, it is created.
 * - This helper does not update existing snapshots.
 *
 * This is intentional because WORKING_BUDGET should not be
 * overwritten once created.
 */
export async function ensureBudgetSnapshot(
  prisma: BudgetDbClient,
  input: EnsureBudgetSnapshotInput
): Promise<EnsureBudgetSnapshotResult> {
  if (!input.companyId) {
    throw new Error("companyId is required to ensure budget snapshot.");
  }

  if (!input.organisationId) {
    throw new Error("organisationId is required to ensure budget snapshot.");
  }

  if (!input.propertyId) {
    throw new Error("propertyId is required to ensure budget snapshot.");
  }

  if (!input.fiscalYear) {
    throw new Error("fiscalYear is required to ensure budget snapshot.");
  }

  if (!input.snapshotType) {
    throw new Error("snapshotType is required to ensure budget snapshot.");
  }

  const existingSnapshot = await prisma.budgetSnapshot.findUnique({
    where: {
      propertyId_fiscalYear_snapshotType: {
        propertyId: input.propertyId,
        fiscalYear: input.fiscalYear,
        snapshotType: input.snapshotType
      }
    },
    select: {
      snapshotId: true
    }
  });

  if (existingSnapshot) {
    return {
      snapshotId: existingSnapshot.snapshotId,
      wasCreated: false
    };
  }

  const createdSnapshot = await prisma.budgetSnapshot.create({
    data: {
      companyId: input.companyId,
      organisationId: input.organisationId,
      propertyId: input.propertyId,
      fiscalYear: input.fiscalYear,
      snapshotType: input.snapshotType,
      status: input.status,
      sourceSystem: input.sourceSystem ?? "ENTRATA",
      importedAt: new Date(),
      generatedAt: new Date()
    },
    select: {
      snapshotId: true
    }
  });

  return {
    snapshotId: createdSnapshot.snapshotId,
    wasCreated: true
  };
}

/**
 * Ensures WORKING_BUDGET snapshot exists.
 *
 * Rule:
 * - Create if missing.
 * - Ignore if already exists.
 * - Used only to initialize working budget once.
 */
export async function ensureWorkingBudgetSnapshot(
  prisma: BudgetDbClient,
  input: Omit<EnsureBudgetSnapshotInput, "snapshotType" | "status">
): Promise<EnsureBudgetSnapshotResult> {
  return ensureBudgetSnapshot(prisma, {
    ...input,
    snapshotType: "WORKING_BUDGET",
    status: "ACTIVE"
  });
}

/**
 * Ensures BUDGET snapshot exists.
 *
 * Rule:
 * - Create if missing.
 * - Calc lines can be updated by projection service separately.
 */
export async function ensureBudgetSnapshotForImportedBudget(
  prisma: BudgetDbClient,
  input: Omit<EnsureBudgetSnapshotInput, "snapshotType" | "status">
): Promise<EnsureBudgetSnapshotResult> {
  return ensureBudgetSnapshot(prisma, {
    ...input,
    snapshotType: "BUDGET",
    status: "ACTIVE"
  });
}

/**
 * Ensures ACTUALS snapshot exists.
 *
 * Rule:
 * - Create if missing.
 * - Actual calc lines are updated from Entrata actuals separately.
 */
export async function ensureActualsSnapshot(
  prisma: BudgetDbClient,
  input: Omit<EnsureBudgetSnapshotInput, "snapshotType" | "status">
): Promise<EnsureBudgetSnapshotResult> {
  return ensureBudgetSnapshot(prisma, {
    ...input,
    snapshotType: "ACTUALS",
    status: "ACTIVE"
  });
}