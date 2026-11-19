export type WorkerMode = "ALL" | "PROPERTY_DOMAIN" | "BUDGET_DOMAIN" | "RENT_DETAILS_DOMAIN" | "INCOME_STATEMENT_ONLY" | "BUDGET_REPORT_ONLY" | "REPORT_ONLY" | "BUDGET_ACTUAL_ONLY" | "BUDGET_ONLY" | "PROPERTY_ONLY" | "PROPERTY_UNIT_ONLY" | "UNIT_TYPE_ONLY" | "GL_TREE_ONLY" | "NONE";
export declare const workerModes: WorkerMode[];
export declare function loadProcessorsForMode(workerMode: WorkerMode): Promise<void>;
export declare function startDomainWorker(workerMode: WorkerMode): Promise<void>;
export declare function stopDomainWorker(): Promise<void>;
//# sourceMappingURL=domain-worker-loader.d.ts.map