import type { SyncPropertyJobData, TransformPropertyStagingJobData, SyncPropertyUnitJobData, TransformPropertyUnitStagingJobData, SyncUnitTypeJobData, TransformUnitTypeStagingJobData, SyncBudgetJobData, TransformBudgetStagingJobData, SyncReportDataJobData, TransformReportDataStagingJobData, ProjectOccupancyFromReportsJobData, SyncGlTreeJobData, TransformGlTreeStagingJobData, SyncBudgetActualJobData, TransformBudgetActualStagingJobData, ProjectBudgetActualSnapshotsJobData, SyncIncomeStatementActualsJobData, StageIncomeStatementActualsJobData, TransformIncomeStatementActualsJobData, ProjectIncomeStatementActualsJobData, ProcessIncomeStatementPropertyJobData } from "./job-types.js";
export interface AddJobOptions {
    attempts?: number;
    backoff?: {
        type: string;
        delay: number;
    };
    jobId?: string;
    singletonKey?: string;
    removeOnComplete?: boolean | number;
    removeOnFail?: boolean | number;
    delay?: number;
    startAfter?: number | string | Date;
    [key: string]: any;
}
export declare class PgBossQueue<T extends object> {
    readonly name: string;
    constructor(name: string);
    add(jobName: string, data: T, options?: AddJobOptions): Promise<{
        id: string | undefined;
    }>;
    upsertJobScheduler(schedulerId: string, repeatOptions: {
        pattern: string;
    }, jobTemplate: {
        name: string;
        data: T;
        opts?: AddJobOptions;
    }): Promise<void>;
    close(): Promise<void>;
}
export declare const syncPropertyQueue: PgBossQueue<SyncPropertyJobData>;
export declare const syncPropertyUnitQueue: PgBossQueue<SyncPropertyUnitJobData>;
export declare const syncUnitTypeQueue: PgBossQueue<SyncUnitTypeJobData>;
export declare const syncBudgetQueue: PgBossQueue<SyncBudgetJobData>;
export declare const syncReportDataQueue: PgBossQueue<SyncReportDataJobData>;
export declare const syncGlTreeQueue: PgBossQueue<SyncGlTreeJobData>;
export declare const syncBudgetActualQueue: PgBossQueue<SyncBudgetActualJobData>;
export declare const transformPropertyStagingQueue: PgBossQueue<TransformPropertyStagingJobData>;
export declare const transformPropertyUnitStagingQueue: PgBossQueue<TransformPropertyUnitStagingJobData>;
export declare const transformUnitTypeStagingQueue: PgBossQueue<TransformUnitTypeStagingJobData>;
export declare const transformBudgetStagingQueue: PgBossQueue<TransformBudgetStagingJobData>;
export declare const transformReportDataStagingQueue: PgBossQueue<TransformReportDataStagingJobData>;
export declare const transformGlTreeStagingQueue: PgBossQueue<TransformGlTreeStagingJobData>;
export declare const transformBudgetActualStagingQueue: PgBossQueue<TransformBudgetActualStagingJobData>;
export declare const projectOccupancyFromReportsQueue: PgBossQueue<ProjectOccupancyFromReportsJobData>;
export declare const projectBudgetActualSnapshotsQueue: PgBossQueue<ProjectBudgetActualSnapshotsJobData>;
export declare const syncIncomeStatementActualsQueue: PgBossQueue<SyncIncomeStatementActualsJobData>;
export declare const stageIncomeStatementActualsQueue: PgBossQueue<StageIncomeStatementActualsJobData>;
export declare const transformIncomeStatementActualsQueue: PgBossQueue<TransformIncomeStatementActualsJobData>;
export declare const projectIncomeStatementActualsQueue: PgBossQueue<ProjectIncomeStatementActualsJobData>;
export declare const processIncomeStatementPropertyQueue: PgBossQueue<ProcessIncomeStatementPropertyJobData>;
export declare function closeQueues(): Promise<void>;
//# sourceMappingURL=integration-queues.d.ts.map