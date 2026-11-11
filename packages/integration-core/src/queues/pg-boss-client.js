import { PgBoss } from "pg-boss";
import { QueueNames } from "./queue-names.js";
let bossInstance = null;
let startPromise = null;
export function getPgBoss() {
    if (!bossInstance) {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            throw new Error("DATABASE_URL is required for pg-boss.");
        }
        bossInstance = new PgBoss({
            connectionString,
            schema: "pgboss"
        });
        bossInstance.on("error", (error) => {
            console.error("[pg-boss error]", error?.message ?? error);
        });
    }
    return bossInstance;
}
export async function startPgBoss() {
    const boss = getPgBoss();
    if (!startPromise) {
        startPromise = (async () => {
            await boss.start();
            for (const name of Object.values(QueueNames)) {
                try {
                    await boss.createQueue(name);
                }
                catch {
                    // Ignore if queue already exists
                }
            }
            return boss;
        })();
    }
    return startPromise;
}
export async function stopPgBoss() {
    if (bossInstance) {
        await bossInstance.stop();
        bossInstance = null;
        startPromise = null;
    }
}
export class PgBossWorker {
    queueName;
    processor;
    failedListeners = [];
    constructor(queueName, processor, options) {
        this.queueName = queueName;
        this.processor = processor;
        const localConcurrency = options?.concurrency ?? 1;
        const startWork = async () => {
            const boss = await startPgBoss();
            await boss.work(queueName, { localConcurrency }, async (jobs) => {
                const jobList = Array.isArray(jobs) ? jobs : [jobs];
                for (const job of jobList) {
                    const jobData = job.data;
                    const jobName = jobData?.__jobName ?? job.name ?? queueName;
                    const workerJob = {
                        id: job.id,
                        name: jobName,
                        data: job.data
                    };
                    try {
                        await processor(workerJob);
                    }
                    catch (error) {
                        const err = error instanceof Error ? error : new Error(String(error));
                        for (const listener of this.failedListeners) {
                            try {
                                listener(workerJob, err);
                            }
                            catch {
                                // Ignore listener errors
                            }
                        }
                        throw error;
                    }
                }
            });
        };
        startWork().catch((err) => {
            console.error(`[pg-boss worker error] Failed starting worker for ${queueName}:`, err);
        });
    }
    on(event, listener) {
        if (event === "failed") {
            this.failedListeners.push(listener);
        }
    }
    async close() { }
}
//# sourceMappingURL=pg-boss-client.js.map