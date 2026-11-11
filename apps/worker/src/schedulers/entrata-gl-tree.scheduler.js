import { prisma } from "@budget-integration/database";
import { syncGlTreeQueue } from "@budget-integration/integration-core";
function getSchedulePattern(syncSettingsJson) {
    if (syncSettingsJson &&
        typeof syncSettingsJson === "object" &&
        !Array.isArray(syncSettingsJson)) {
        const value = syncSettingsJson.schedule;
        if (typeof value === "string" && value.trim().length > 0) {
            return value;
        }
    }
    return "*/30 * * * *";
}
export async function registerEntrataGlTreeSchedulers() {
    const sources = await prisma.integrationSource.findMany({
        where: {
            sourceType: "entrata",
            isActive: true,
            entities: {
                some: {
                    entityName: "GlTree",
                    isEnabled: true
                }
            }
        },
        include: {
            entities: {
                where: {
                    entityName: "GlTree",
                    isEnabled: true
                }
            }
        }
    });
    for (const source of sources) {
        const glTreeEntity = source.entities[0];
        if (!glTreeEntity) {
            continue;
        }
        const cronPattern = getSchedulePattern(glTreeEntity.syncSettingsJson);
        const schedulerId = `sync-entrata-gl-trees-${source.companyId}-${source.organisationId}-${source.id}`;
        await syncGlTreeQueue.upsertJobScheduler(schedulerId, {
            pattern: cronPattern
        }, {
            name: "sync-entrata-gl-trees",
            data: {
                companyId: source.companyId,
                organisationId: source.organisationId,
                integrationSourceId: source.id,
                entityName: "GlTree"
            },
            opts: {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 5000
                },
                removeOnComplete: 100,
                removeOnFail: 1000
            }
        });
        console.log(`Registered GL Tree scheduler: ${schedulerId}, Source: ${source.sourceCode}, Cron: ${cronPattern}`);
    }
}
//# sourceMappingURL=entrata-gl-tree.scheduler.js.map