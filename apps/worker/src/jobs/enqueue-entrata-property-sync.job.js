import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";
import { syncPropertyQueue } from "@budget-integration/integration-core";
export async function enqueueEntrataPropertySyncJobs() {
    const sources = await prisma.integrationSource.findMany({
        where: {
            sourceType: "entrata",
            isActive: true,
            entities: {
                some: {
                    entityName: "Property",
                    isEnabled: true
                }
            }
        }
    });
    for (const source of sources) {
        const queueRecord = await prisma.integrationQueueJob.create({
            data: {
                companyId: source.companyId,
                organisationId: source.organisationId,
                integrationSourceId: source.id,
                queueName: "sync-property-queue",
                jobName: "sync-entrata-property",
                entityName: "Property",
                status: "QUEUED",
                payloadJson: {
                    companyId: source.companyId,
                    organisationId: source.organisationId,
                    integrationSourceId: source.id,
                    entityName: "Property"
                }
            }
        });
        const job = await syncPropertyQueue.add("sync-entrata-property", {
            companyId: source.companyId,
            organisationId: source.organisationId,
            integrationSourceId: source.id,
            entityName: "Property"
        }, {
            attempts: 3,
            backoff: { type: "exponential", delay: 5000 },
            removeOnComplete: 100,
            removeOnFail: 1000
        });
        await prisma.integrationQueueJob.update({
            where: { id: queueRecord.id },
            data: { bullJobId: String(job.id) }
        });
        console.log(`Queued Entrata Property sync. Source: ${source.sourceCode}, BullJobId: ${job.id}`);
    }
}
//# sourceMappingURL=enqueue-entrata-property-sync.job.js.map