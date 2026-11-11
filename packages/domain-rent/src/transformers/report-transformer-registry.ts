import type { PrismaClient } from "@prisma/client";
import { transformPropertyClosingStatus } from "./property-closing-status.transformer.js";
import { transformBoxScoreReport } from "./box-score.transformer.js";
import { transformResidentRetentionReport } from "./resident-retention.transformer.js";

export interface ReportTransformerPropertyCacheItem {
  id: string;
  code: string | null;
  externalId: number | null;
  name: string | null;
  fiscalYearStartMonth: number | null;
  reforecastLockedTillMonth?: number | null;
}

export interface ReportTransformerInput {
  stagingReportDataId: string;
  companyId: string;
  organisationId: string;
  integrationSourceId: string;
  reportCode: string;
  sourceRecordId: string;
  sourceHash?: string | null;
  rawRecordPayload: unknown;
  rawRequest?: unknown;
  cachedProperties?: ReportTransformerPropertyCacheItem[];
}

export type ReportTransformer = (
  prisma: PrismaClient,
  input: ReportTransformerInput
) => Promise<void>;

const registry: Record<string, ReportTransformer> = {

  property_closings: transformPropertyClosingStatus,

  box_score: transformBoxScoreReport,
  resident_retention: transformResidentRetentionReport
};

export function getReportTransformer(
  reportCode: string
): ReportTransformer | undefined {
  return registry[reportCode];
}



