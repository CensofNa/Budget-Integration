import { Prisma, PrismaClient } from "@prisma/client";
type BudgetDbClient = PrismaClient | Prisma.TransactionClient;
export type BudgetSnapshotType = "WORKING_BUDGET" | "BUDGET" | "ACTUALS";
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
export declare function ensureBudgetSnapshot(prisma: BudgetDbClient, input: EnsureBudgetSnapshotInput): Promise<EnsureBudgetSnapshotResult>;
/**
 * Ensures WORKING_BUDGET snapshot exists.
 *
 * Rule:
 * - Create if missing.
 * - Ignore if already exists.
 * - Used only to initialize working budget once.
 */
export declare function ensureWorkingBudgetSnapshot(prisma: BudgetDbClient, input: Omit<EnsureBudgetSnapshotInput, "snapshotType" | "status">): Promise<EnsureBudgetSnapshotResult>;
/**
 * Ensures BUDGET snapshot exists.
 *
 * Rule:
 * - Create if missing.
 * - Calc lines can be updated by projection service separately.
 */
export declare function ensureBudgetSnapshotForImportedBudget(prisma: BudgetDbClient, input: Omit<EnsureBudgetSnapshotInput, "snapshotType" | "status">): Promise<EnsureBudgetSnapshotResult>;
/**
 * Ensures ACTUALS snapshot exists.
 *
 * Rule:
 * - Create if missing.
 * - Actual calc lines are updated from Entrata actuals separately.
 */
export declare function ensureActualsSnapshot(prisma: BudgetDbClient, input: Omit<EnsureBudgetSnapshotInput, "snapshotType" | "status">): Promise<EnsureBudgetSnapshotResult>;
export {};
//# sourceMappingURL=budget-snapshot-helper.d.ts.map