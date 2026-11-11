import { startPgBoss, stopPgBoss } from "./pg-boss-client.js";
import { QueueNames } from "./queue-names.js";
export class PgBossQueue {
    name;
    constructor(name) {
        this.name = name;
    }
    async add(jobName, data, options) {
        const boss = await startPgBoss();
        const key = options?.jobId ?? options?.singletonKey;
        const delaySeconds = options?.delay ? Math.round(options.delay / 1000) : undefined;
        const payload = (typeof data === "object" && data !== null)
            ? { ...data, __jobName: jobName }
            : data;
        const jobId = await boss.send(this.name, payload, {
            retryLimit: options?.attempts ?? 3,
            retryDelay: options?.backoff?.delay ? Math.round(options.backoff.delay / 1000) : 5,
            retryBackoff: true,
            ...(key ? { singletonKey: key } : {}),
            ...(delaySeconds ? { startAfter: delaySeconds } : {})
        });
        return { id: jobId ?? undefined };
    }
    async upsertJobScheduler(schedulerId, repeatOptions, jobTemplate) {
        const boss = await startPgBoss();
        const payload = (typeof jobTemplate.data === "object" && jobTemplate.data !== null)
            ? { ...jobTemplate.data, __jobName: jobTemplate.name }
            : jobTemplate.data;
        await boss.schedule(this.name, repeatOptions.pattern, payload, {
            retryLimit: jobTemplate.opts?.attempts ?? 3,
            retryDelay: jobTemplate.opts?.backoff?.delay ? Math.round(jobTemplate.opts.backoff.delay / 1000) : 5,
            retryBackoff: true
        });
    }
    async close() { }
}
export const syncPropertyQueue = new PgBossQueue(QueueNames.SyncProperty);
export const syncPropertyUnitQueue = new PgBossQueue(QueueNames.SyncPropertyUnit);
export const syncUnitTypeQueue = new PgBossQueue(QueueNames.SyncUnitType);
export const syncBudgetQueue = new PgBossQueue(QueueNames.SyncBudget);
export const syncReportDataQueue = new PgBossQueue(QueueNames.SyncReportData);
export const syncGlTreeQueue = new PgBossQueue(QueueNames.SyncGlTree);
export const syncBudgetActualQueue = new PgBossQueue(QueueNames.SyncBudgetActual);
export const transformPropertyStagingQueue = new PgBossQueue(QueueNames.TransformPropertyStaging);
export const transformPropertyUnitStagingQueue = new PgBossQueue(QueueNames.TransformPropertyUnitStaging);
export const transformUnitTypeStagingQueue = new PgBossQueue(QueueNames.TransformUnitTypeStaging);
export const transformBudgetStagingQueue = new PgBossQueue(QueueNames.TransformBudgetStaging);
export const transformReportDataStagingQueue = new PgBossQueue(QueueNames.TransformReportDataStaging);
export const transformGlTreeStagingQueue = new PgBossQueue(QueueNames.TransformGlTreeStaging);
export const transformBudgetActualStagingQueue = new PgBossQueue(QueueNames.TransformBudgetActualStaging);
export const projectOccupancyFromReportsQueue = new PgBossQueue(QueueNames.ProjectOccupancyFromReports);
export const projectBudgetActualSnapshotsQueue = new PgBossQueue(QueueNames.ProjectBudgetActualSnapshots);
export const syncIncomeStatementActualsQueue = new PgBossQueue(QueueNames.SyncIncomeStatementActuals);
export const stageIncomeStatementActualsQueue = new PgBossQueue(QueueNames.StageIncomeStatementActuals);
export const transformIncomeStatementActualsQueue = new PgBossQueue(QueueNames.TransformIncomeStatementActuals);
export const projectIncomeStatementActualsQueue = new PgBossQueue(QueueNames.ProjectIncomeStatementActuals);
export const processIncomeStatementPropertyQueue = new PgBossQueue(QueueNames.ProcessIncomeStatementProperty);
export async function closeQueues() {
    await stopPgBoss();
}
//# sourceMappingURL=integration-queues.js.map