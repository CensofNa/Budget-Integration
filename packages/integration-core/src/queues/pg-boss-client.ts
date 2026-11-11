import { PgBoss } from "pg-boss";
import { QueueNames } from "./queue-names.js";

let bossInstance: PgBoss | null = null;
let startPromise: Promise<PgBoss> | null = null;

export function getPgBoss(): PgBoss {
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

export async function startPgBoss(): Promise<PgBoss> {
  const boss = getPgBoss();
  if (!startPromise) {
    startPromise = (async () => {
      await boss.start();
      for (const name of Object.values(QueueNames)) {
        try {
          await boss.createQueue(name);
        } catch {
          // Ignore if queue already exists
        }
      }
      return boss;
    })();
  }
  return startPromise;
}

export async function stopPgBoss(): Promise<void> {
  if (bossInstance) {
    await bossInstance.stop();
    bossInstance = null;
    startPromise = null;
  }
}

export interface WorkerJob<T> {
  id: string;
  name: string;
  data: T;
}

export class PgBossWorker<T extends object = any> {
  private failedListeners: Array<(job: WorkerJob<T> | undefined, error: Error) => void> = [];

  constructor(
    public readonly queueName: string,
    public readonly processor: (job: WorkerJob<T>) => Promise<any>,
    options?: { connection?: unknown; concurrency?: number; lockDuration?: number; [key: string]: any }
  ) {
    const localConcurrency = options?.concurrency ?? 1;

    const startWork = async () => {
      const boss = await startPgBoss();
      await boss.work<T>(queueName, { localConcurrency }, async (jobs: any[]) => {
        const jobList = Array.isArray(jobs) ? jobs : [jobs];
        for (const job of jobList) {
          const jobData = job.data as any;
          const jobName = jobData?.__jobName ?? job.name ?? queueName;
          const workerJob: WorkerJob<T> = {
            id: job.id,
            name: jobName,
            data: job.data
          };
          try {
            await processor(workerJob);
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            for (const listener of this.failedListeners) {
              try {
                listener(workerJob, err);
              } catch {
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

  on(event: "failed", listener: (job: WorkerJob<T> | undefined, error: Error) => void) {
    if (event === "failed") {
      this.failedListeners.push(listener);
    }
  }

  async close(): Promise<void> {}
}
