import { PgBoss } from "pg-boss";
export declare function getPgBoss(): PgBoss;
export declare function startPgBoss(): Promise<PgBoss>;
export declare function stopPgBoss(): Promise<void>;
export interface WorkerJob<T> {
    id: string;
    name: string;
    data: T;
}
export declare class PgBossWorker<T extends object = any> {
    readonly queueName: string;
    readonly processor: (job: WorkerJob<T>) => Promise<any>;
    private failedListeners;
    constructor(queueName: string, processor: (job: WorkerJob<T>) => Promise<any>, options?: {
        connection?: unknown;
        concurrency?: number;
        lockDuration?: number;
        [key: string]: any;
    });
    on(event: "failed", listener: (job: WorkerJob<T> | undefined, error: Error) => void): void;
    close(): Promise<void>;
}
//# sourceMappingURL=pg-boss-client.d.ts.map