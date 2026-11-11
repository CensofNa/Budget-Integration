import { PgBossWorker as Worker } from "@budget-integration/integration-core";
interface TransformGlTreeStagingJobData {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    syncRunId?: string;
    stagingBatchId?: string;
    entityName: "GlTree";
    batchSize?: number;
}
export declare const transformGlTreeStagingWorker: Worker<TransformGlTreeStagingJobData>;
export {};
//# sourceMappingURL=transform-gl-tree-staging.processor.d.ts.map