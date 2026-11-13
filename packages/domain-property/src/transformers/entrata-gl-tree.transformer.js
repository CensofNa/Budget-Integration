import { Prisma } from "@prisma/client";
import { asObject, getBoolean, getString } from "@budget-integration/integration-core";
async function markStagingTransformed(prisma, stagingGlTreeId) {
    await prisma.stagingGlTree.update({
        where: {
            id: stagingGlTreeId
        },
        data: {
            validationStatus: "VALID",
            transformStatus: "TRANSFORMED",
            transformedAt: new Date(),
            validationErrors: Prisma.JsonNull,
            transformErrors: Prisma.JsonNull
        }
    });
}
async function upsertSourceRecordMap(prisma, input) {
    await prisma.sourceRecordMap.upsert({
        where: {
            companyId_organisationId_integrationSourceId_entityName_sourceRecordId: {
                companyId: input.companyId,
                organisationId: input.organisationId,
                integrationSourceId: input.integrationSourceId,
                entityName: input.entityName,
                sourceRecordId: input.sourceRecordId
            }
        },
        update: {
            canonicalTableName: input.canonicalTableName,
            canonicalRecordId: input.canonicalRecordId,
            sourceHash: input.sourceHash ?? null,
            matchStatus: "AUTO_MATCHED",
            lastSyncedAt: new Date()
        },
        create: {
            companyId: input.companyId,
            organisationId: input.organisationId,
            integrationSourceId: input.integrationSourceId,
            entityName: input.entityName,
            sourceRecordId: input.sourceRecordId,
            canonicalTableName: input.canonicalTableName,
            canonicalRecordId: input.canonicalRecordId,
            sourceHash: input.sourceHash ?? null,
            matchStatus: "AUTO_MATCHED",
            lastSyncedAt: new Date()
        }
    });
}
async function resolveGlTree(prisma, input) {
    const glTree = await prisma.glTree.findFirst({
        where: {
            companyId: input.companyId,
            organisationId: input.organisationId,
            sourceGlTreeId: input.sourceGlTreeId
        }
    });
    if (!glTree) {
        throw new Error(`GL Tree not found for sourceGlTreeId: ${input.sourceGlTreeId}`);
    }
    return glTree;
}
export async function transformEntrataGlTree(prisma, input) {
    const payload = asObject(input.rawGlTreePayload);
    if (!input.sourceGlTreeId) {
        throw new Error("GL Tree sourceGlTreeId is missing.");
    }
    if (input.recordType === "TREE") {
        const sourceGlTreeId = getString(payload.id) ??
            getString(payload.glTreeId) ??
            input.sourceGlTreeId;
        const treeName = getString(payload.name) ??
            getString(payload.treeName) ??
            getString(payload.glTreeName);
        const canonicalGlTree = await prisma.glTree.upsert({
            where: {
                companyId_organisationId_sourceGlTreeId: {
                    companyId: input.companyId,
                    organisationId: input.organisationId,
                    sourceGlTreeId
                }
            },
            update: {
                treeName: treeName ?? null,
                isMasterGlTree: getBoolean(payload.isMasterGlTree) ?? null,
                sourceHash: input.sourceHash ?? null,
                lastSyncedAt: new Date()
            },
            create: {
                companyId: input.companyId,
                organisationId: input.organisationId,
                sourceGlTreeId,
                treeName: treeName ?? null,
                isMasterGlTree: getBoolean(payload.isMasterGlTree) ?? null,
                sourceHash: input.sourceHash ?? null,
                lastSyncedAt: new Date()
            }
        });
        await upsertSourceRecordMap(prisma, {
            companyId: input.companyId,
            organisationId: input.organisationId,
            integrationSourceId: input.integrationSourceId,
            entityName: "GlTree",
            sourceRecordId: input.sourceRecordId,
            canonicalTableName: "gl_trees",
            canonicalRecordId: canonicalGlTree.id,
            sourceHash: input.sourceHash ?? null
        });
        await markStagingTransformed(prisma, input.stagingGlTreeId);
        return;
    }
    const canonicalGlTree = await resolveGlTree(prisma, input);
    if (input.recordType === "BRANCH") {
        const sourceBranchId = getString(payload.branchId) ??
            getString(payload.id) ??
            input.sourceBranchId;
        if (!sourceBranchId) {
            throw new Error("GL Tree Branch sourceBranchId is missing.");
        }
        const canonicalBranch = await prisma.glTreeBranch.upsert({
            where: {
                companyId_organisationId_glTreeId_sourceBranchId: {
                    companyId: input.companyId,
                    organisationId: input.organisationId,
                    glTreeId: canonicalGlTree.id,
                    sourceBranchId
                }
            },
            update: {
                groupType: getString(payload.groupType) ?? null,
                isEnabled: getBoolean(payload.isEnabled) ?? null,
                showGroupName: getBoolean(payload.showGroupName) ?? null,
                groupName: getString(payload.groupName) ?? null,
                showSummaryRow: getBoolean(payload.showSummaryRow) ?? null,
                summaryRowName: getString(payload.summaryRowName) ?? null,
                description: getString(payload.description) ?? null,
                sourceHash: input.sourceHash ?? null,
                lastSyncedAt: new Date()
            },
            create: {
                companyId: input.companyId,
                organisationId: input.organisationId,
                glTreeId: canonicalGlTree.id,
                sourceBranchId,
                groupType: getString(payload.groupType) ?? null,
                isEnabled: getBoolean(payload.isEnabled) ?? null,
                showGroupName: getBoolean(payload.showGroupName) ?? null,
                groupName: getString(payload.groupName) ?? null,
                showSummaryRow: getBoolean(payload.showSummaryRow) ?? null,
                summaryRowName: getString(payload.summaryRowName) ?? null,
                description: getString(payload.description) ?? null,
                sourceHash: input.sourceHash ?? null,
                lastSyncedAt: new Date()
            }
        });
        await upsertSourceRecordMap(prisma, {
            companyId: input.companyId,
            organisationId: input.organisationId,
            integrationSourceId: input.integrationSourceId,
            entityName: "GlTree",
            sourceRecordId: input.sourceRecordId,
            canonicalTableName: "gl_tree_branches",
            canonicalRecordId: canonicalBranch.id,
            sourceHash: input.sourceHash ?? null
        });
        await markStagingTransformed(prisma, input.stagingGlTreeId);
        return;
    }
    if (input.recordType === "ACCOUNT") {
        const sourceGlAccountId = getString(payload.id) ??
            input.sourceGlAccountId;
        const sourceBranchId = getString(payload.branchId) ??
            input.sourceBranchId;
        const accountNumber = getString(payload.accountNumber);
        const accountName = getString(payload.accountName);
        if (!sourceGlAccountId) {
            throw new Error("GL Account sourceGlAccountId is missing.");
        }
        if (!accountNumber) {
            throw new Error(`GL Account accountNumber is missing for sourceGlAccountId: ${sourceGlAccountId}`);
        }
        if (!accountName) {
            throw new Error(`GL Account accountName is missing for sourceGlAccountId: ${sourceGlAccountId}`);
        }
        const canonicalBranch = sourceBranchId
            ? await prisma.glTreeBranch.findFirst({
                where: {
                    companyId: input.companyId,
                    organisationId: input.organisationId,
                    glTreeId: canonicalGlTree.id,
                    sourceBranchId
                }
            })
            : null;
        const canonicalAccount = await prisma.glAccount.upsert({
            where: {
                companyId_organisationId_glTreeId_accountNumber: {
                    companyId: input.companyId,
                    organisationId: input.organisationId,
                    glTreeId: canonicalGlTree.id,
                    accountNumber
                }
            },
            update: {
                glTreeId: canonicalGlTree.id,
                glTreeBranchId: canonicalBranch?.id ?? null,
                sourceBranchId: sourceBranchId ?? null,
                accountNumber,
                sourceGlAccountId,
                accountName,
                glGroupType: getString(payload.glGroupType) ?? null,
                groupLocation: getString(payload.groupLocation) ?? null,
                description: getString(payload.description) ?? null,
                status: getString(payload.status) ?? null,
                isSystem: getBoolean(payload.isSystem) ?? null,
                sourceHash: input.sourceHash ?? null,
                lastSyncedAt: new Date()
            },
            create: {
                companyId: input.companyId,
                organisationId: input.organisationId,
                glTreeId: canonicalGlTree.id,
                glTreeBranchId: canonicalBranch?.id ?? null,
                sourceGlAccountId,
                sourceBranchId: sourceBranchId ?? null,
                accountNumber,
                accountName,
                glGroupType: getString(payload.glGroupType) ?? null,
                groupLocation: getString(payload.groupLocation) ?? null,
                description: getString(payload.description) ?? null,
                status: getString(payload.status) ?? null,
                isSystem: getBoolean(payload.isSystem) ?? null,
                sourceHash: input.sourceHash ?? null,
                lastSyncedAt: new Date()
            }
        });
        await upsertSourceRecordMap(prisma, {
            companyId: input.companyId,
            organisationId: input.organisationId,
            integrationSourceId: input.integrationSourceId,
            entityName: "GlTree",
            sourceRecordId: input.sourceRecordId,
            canonicalTableName: "gl_accounts",
            canonicalRecordId: canonicalAccount.id,
            sourceHash: input.sourceHash ?? null
        });
        await markStagingTransformed(prisma, input.stagingGlTreeId);
        return;
    }
    throw new Error(`Unsupported GL Tree recordType: ${input.recordType}`);
}
//# sourceMappingURL=entrata-gl-tree.transformer.js.map