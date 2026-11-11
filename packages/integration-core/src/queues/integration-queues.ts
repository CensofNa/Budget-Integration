import { startPgBoss, stopPgBoss } from "./pg-boss-client.js";
import { QueueNames } from "./queue-names.js";
import type {
  SyncPropertyJobData,
  TransformPropertyStagingJobData,

  SyncPropertyUnitJobData,
  TransformPropertyUnitStagingJobData,

  SyncUnitTypeJobData,
  TransformUnitTypeStagingJobData,

  SyncBudgetJobData,
  TransformBudgetStagingJobData,

  SyncReportDataJobData,
  TransformReportDataStagingJobData,
  ProjectOccupancyFromReportsJobData,

  SyncGlTreeJobData,
  TransformGlTreeStagingJobData,

  SyncBudgetActualJobData,
  TransformBudgetActualStagingJobData,
  ProjectBudgetActualSnapshotsJobData,

  SyncIncomeStatementActualsJobData,
  StageIncomeStatementActualsJobData,
  TransformIncomeStatementActualsJobData,
  ProjectIncomeStatementActualsJobData,
  ProcessIncomeStatementPropertyJobData,

  SyncBalanceSheetActualsJobData,
  StageBalanceSheetActualsJobData,
  TransformBalanceSheetActualsJobData,
  ProjectBalanceSheetActualsJobData
} from "./job-types.js";

export interface AddJobOptions {
  attempts?: number;
  backoff?: { type: string; delay: number };
  jobId?: string;
  singletonKey?: string;
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
  delay?: number;
  startAfter?: number | string | Date;
  [key: string]: any;
}

export class PgBossQueue<T extends object> {
  constructor(public readonly name: string) {}

  async add(
    jobName: string,
    data: T,
    options?: AddJobOptions
  ): Promise<{ id: string | undefined }> {
    const boss = await startPgBoss();
    const key = options?.jobId ?? options?.singletonKey;
    const delaySeconds = options?.delay ? Math.round(options.delay / 1000) : undefined;
    const payload = (typeof data === "object" && data !== null)
      ? { ...data, __jobName: jobName }
      : data;

    const jobId = await boss.send(this.name, payload as object, {
      retryLimit: options?.attempts ?? 3,
      retryDelay: options?.backoff?.delay ? Math.round(options.backoff.delay / 1000) : 5,
      retryBackoff: true,
      ...(key ? { singletonKey: key } : {}),
      ...(delaySeconds ? { startAfter: delaySeconds } : {})
    });
    return { id: jobId ?? undefined };
  }

  async upsertJobScheduler(
    schedulerId: string,
    repeatOptions: { pattern: string },
    jobTemplate: {
      name: string;
      data: T;
      opts?: AddJobOptions;
    }
  ): Promise<void> {
    const boss = await startPgBoss();
    const payload = (typeof jobTemplate.data === "object" && jobTemplate.data !== null)
      ? { ...jobTemplate.data, __jobName: jobTemplate.name }
      : jobTemplate.data;

    await boss.schedule(this.name, repeatOptions.pattern, payload as object, {
      retryLimit: jobTemplate.opts?.attempts ?? 3,
      retryDelay: jobTemplate.opts?.backoff?.delay ? Math.round(jobTemplate.opts.backoff.delay / 1000) : 5,
      retryBackoff: true
    });
  }

  async close(): Promise<void> {}
}

export const syncPropertyQueue = new PgBossQueue<SyncPropertyJobData>(QueueNames.SyncProperty);
export const syncPropertyUnitQueue = new PgBossQueue<SyncPropertyUnitJobData>(QueueNames.SyncPropertyUnit);
export const syncUnitTypeQueue = new PgBossQueue<SyncUnitTypeJobData>(QueueNames.SyncUnitType);
export const syncBudgetQueue = new PgBossQueue<SyncBudgetJobData>(QueueNames.SyncBudget);
export const syncReportDataQueue = new PgBossQueue<SyncReportDataJobData>(QueueNames.SyncReportData);
export const syncGlTreeQueue = new PgBossQueue<SyncGlTreeJobData>(QueueNames.SyncGlTree);
export const syncBudgetActualQueue = new PgBossQueue<SyncBudgetActualJobData>(QueueNames.SyncBudgetActual);

export const transformPropertyStagingQueue = new PgBossQueue<TransformPropertyStagingJobData>(QueueNames.TransformPropertyStaging);
export const transformPropertyUnitStagingQueue = new PgBossQueue<TransformPropertyUnitStagingJobData>(QueueNames.TransformPropertyUnitStaging);
export const transformUnitTypeStagingQueue = new PgBossQueue<TransformUnitTypeStagingJobData>(QueueNames.TransformUnitTypeStaging);
export const transformBudgetStagingQueue = new PgBossQueue<TransformBudgetStagingJobData>(QueueNames.TransformBudgetStaging);
export const transformReportDataStagingQueue = new PgBossQueue<TransformReportDataStagingJobData>(QueueNames.TransformReportDataStaging);
export const transformGlTreeStagingQueue = new PgBossQueue<TransformGlTreeStagingJobData>(QueueNames.TransformGlTreeStaging);
export const transformBudgetActualStagingQueue = new PgBossQueue<TransformBudgetActualStagingJobData>(QueueNames.TransformBudgetActualStaging);

export const projectOccupancyFromReportsQueue = new PgBossQueue<ProjectOccupancyFromReportsJobData>(QueueNames.ProjectOccupancyFromReports);
export const projectBudgetActualSnapshotsQueue = new PgBossQueue<ProjectBudgetActualSnapshotsJobData>(QueueNames.ProjectBudgetActualSnapshots);

export const syncIncomeStatementActualsQueue = new PgBossQueue<SyncIncomeStatementActualsJobData>(QueueNames.SyncIncomeStatementActuals);
export const stageIncomeStatementActualsQueue = new PgBossQueue<StageIncomeStatementActualsJobData>(QueueNames.StageIncomeStatementActuals);
export const transformIncomeStatementActualsQueue = new PgBossQueue<TransformIncomeStatementActualsJobData>(QueueNames.TransformIncomeStatementActuals);
export const projectIncomeStatementActualsQueue = new PgBossQueue<ProjectIncomeStatementActualsJobData>(QueueNames.ProjectIncomeStatementActuals);
export const processIncomeStatementPropertyQueue = new PgBossQueue<ProcessIncomeStatementPropertyJobData>(QueueNames.ProcessIncomeStatementProperty);

export const syncBalanceSheetActualsQueue = new PgBossQueue<SyncBalanceSheetActualsJobData>(QueueNames.SyncBalanceSheetActuals);
export const stageBalanceSheetActualsQueue = new PgBossQueue<StageBalanceSheetActualsJobData>(QueueNames.StageBalanceSheetActuals);
export const transformBalanceSheetActualsQueue = new PgBossQueue<TransformBalanceSheetActualsJobData>(QueueNames.TransformBalanceSheetActuals);
export const projectBalanceSheetActualsQueue = new PgBossQueue<ProjectBalanceSheetActualsJobData>(QueueNames.ProjectBalanceSheetActuals);

export async function closeQueues(): Promise<void> {
  await stopPgBoss();
}