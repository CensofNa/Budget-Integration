import { Prisma } from "@prisma/client";
import { prisma } from "@budget-integration/database";
import { transformEntrataProperty } from "@budget-integration/integration-core";
import { transformEntrataPropertyUnit } from "@budget-integration/integration-core";
export async function cloneDemoPropertyJob(input) {
    const { companyId, organisationId, integrationSourceId, sourcePropertyCode, targetPropertyCode, demoPropertyName } = input;
    console.log(`[clone-demo-property] Cloning property ${sourcePropertyCode} → ${targetPropertyCode}`);
    // ── Step 1: find the most recent transformed staging row for the source property ──
    const sourceStaging = await prisma.stagingProperty.findFirst({
        where: {
            companyId,
            organisationId,
            integrationSourceId,
            sourceRecordId: sourcePropertyCode,
            transformStatus: "TRANSFORMED"
        },
        orderBy: { stagedAt: "desc" }
    });
    if (!sourceStaging) {
        throw new Error(`[clone-demo-property] No transformed stagingProperty found for sourceRecordId="${sourcePropertyCode}".`);
    }
    // ── Step 2: clone the raw payload, overriding the property code fields ──
    const clonedPayload = JSON.parse(JSON.stringify(sourceStaging.rawPropertyPayload));
    clonedPayload["PropertyID"] = targetPropertyCode;
    clonedPayload["PropertyCode"] = targetPropertyCode;
    // ── Step 3: create a synthetic syncRun and stagingApiBatch for the demo clone ──
    const syncRun = await prisma.integrationSyncRun.create({
        data: {
            companyId,
            organisationId,
            integrationSourceId,
            entityName: "Property",
            syncType: "PROPERTY_SYNC",
            status: "STARTED",
            requestId: `demo-clone-property-${targetPropertyCode}-${Date.now()}`
        }
    });
    const batch = await prisma.stagingApiBatch.create({
        data: {
            companyId,
            organisationId,
            integrationSourceId,
            syncRunId: syncRun.id,
            entityName: "Property",
            sourceMethod: "cloneDemoProperty",
            requestId: `demo-clone-property-${targetPropertyCode}-${Date.now()}`,
            responseCode: 200,
            rawRequest: {
                method: "cloneDemoProperty",
                sourcePropertyCode,
                targetPropertyCode
            },
            rawResponse: clonedPayload,
            status: "RECEIVED"
        }
    });
    // ── Step 4: insert the cloned stagingProperty row ──
    const clonedStagingProperty = await prisma.stagingProperty.create({
        data: {
            companyId,
            organisationId,
            integrationSourceId,
            syncRunId: syncRun.id,
            stagingBatchId: batch.id,
            sourceRecordId: targetPropertyCode,
            parentSourceRecordId: sourceStaging.parentSourceRecordId,
            propertyCode: targetPropertyCode,
            propertyName: demoPropertyName || `${sourceStaging.propertyName} (DEMO)`,
            propertyType: sourceStaging.propertyType,
            rawPropertyPayload: clonedPayload,
            validationStatus: "PENDING",
            transformStatus: "PENDING"
        }
    });
    // ── Step 5: transform the cloned property ──
    await transformEntrataProperty(prisma, {
        companyId,
        organisationId,
        integrationSourceId,
        stagingPropertyId: clonedStagingProperty.id,
        sourceRecordId: targetPropertyCode,
        sourceHash: null,
        rawPropertyPayload: clonedPayload
    });
    await prisma.integrationSyncRun.update({
        where: { id: syncRun.id },
        data: { status: "STAGED", recordsReceived: 1, recordsStaged: 1, completedAt: new Date() }
    });
    await prisma.stagingApiBatch.update({
        where: { id: batch.id },
        data: { status: "PARSED" }
    });
    console.log(`[clone-demo-property] Property ${targetPropertyCode} created in property table.`);
    // ── Step 5.5: query the demo property and source property; fix demo property name ──
    const demoProperty = await prisma.property.findFirst({
        where: { companyId, code: targetPropertyCode }
    });
    if (!demoProperty) {
        throw new Error(`[clone-demo-property] Demo property with code="${targetPropertyCode}" not found in properties table.`);
    }
    // The transformer writes MarketingName from the raw payload; override with the intended demo name.
    const intendedName = demoPropertyName || `${sourceStaging.propertyName} (DEMO)`;
    await prisma.property.update({
        where: { id: demoProperty.id },
        data: { name: intendedName }
    });
    const sourceProperty = await prisma.property.findFirst({
        where: { companyId, code: sourcePropertyCode }
    });
    if (!sourceProperty) {
        throw new Error(`[clone-demo-property] Source property with code="${sourcePropertyCode}" not found in properties table.`);
    }
    const demoPropertySourceMap = await prisma.sourceRecordMap.findFirst({
        where: {
            companyId,
            organisationId,
            integrationSourceId,
            entityName: "Property",
            canonicalRecordId: demoProperty.id,
            canonicalTableName: "properties"
        }
    });
    if (!demoPropertySourceMap) {
        throw new Error(`[clone-demo-property] SourceRecordMap not found for demo property ID="${demoProperty.id}".`);
    }
    const demoPropertySourceRecordId = demoPropertySourceMap.sourceRecordId;
    console.log(`[clone-demo-property] Demo property sourceRecordId: ${demoPropertySourceRecordId}, propertyId: ${demoProperty.id}`);
    // ── Step 6: find distinct transformed units for the source property ──
    const sourceUnits = await prisma.stagingPropertyUnit.findMany({
        where: {
            companyId,
            organisationId,
            integrationSourceId,
            sourcePropertyId: sourcePropertyCode,
            transformStatus: "TRANSFORMED"
        },
        orderBy: { stagedAt: "desc" },
        distinct: ["sourceUnitId"]
    });
    let unitsTransformed = 0;
    let unitsFailed = 0;
    if (sourceUnits.length === 0) {
        console.log(`[clone-demo-property] No transformed units found for sourcePropertyId="${sourcePropertyCode}". Skipping unit clone.`);
    }
    else {
        console.log(`[clone-demo-property] Cloning ${sourceUnits.length} units into property ${targetPropertyCode}.`);
        // ── Step 7: create a synthetic syncRun + batch for unit cloning ──
        const unitSyncRun = await prisma.integrationSyncRun.create({
            data: {
                companyId,
                organisationId,
                integrationSourceId,
                entityName: "PropertyUnit",
                syncType: "PROPERTY_UNIT_SYNC",
                status: "STARTED",
                requestId: `demo-clone-units-${targetPropertyCode}-${Date.now()}`
            }
        });
        const unitBatch = await prisma.stagingApiBatch.create({
            data: {
                companyId,
                organisationId,
                integrationSourceId,
                syncRunId: unitSyncRun.id,
                entityName: "PropertyUnit",
                sourceMethod: "cloneDemoPropertyUnits",
                requestId: `demo-clone-units-${targetPropertyCode}-${Date.now()}`,
                responseCode: 200,
                rawRequest: { method: "cloneDemoPropertyUnits", sourcePropertyCode, targetPropertyCode },
                rawResponse: { unitCount: sourceUnits.length },
                status: "RECEIVED"
            }
        });
        // ── Step 8: clone and transform each unit ──
        for (const sourceUnit of sourceUnits) {
            const originalUnitId = sourceUnit.sourceUnitId ?? sourceUnit.remotePrimaryKey;
            if (!originalUnitId) {
                unitsFailed++;
                continue;
            }
            const demoUnitId = `DEMO-${sourcePropertyCode}-${originalUnitId}`;
            const clonedUnit = await prisma.stagingPropertyUnit.create({
                data: {
                    companyId,
                    organisationId,
                    integrationSourceId,
                    syncRunId: unitSyncRun.id,
                    stagingBatchId: unitBatch.id,
                    sourcePropertyId: demoPropertySourceRecordId,
                    sourceUnitId: demoUnitId,
                    remotePrimaryKey: sourceUnit.remotePrimaryKey ? `DEMO-${sourcePropertyCode}-${sourceUnit.remotePrimaryKey}` : null,
                    unitNumber: sourceUnit.unitNumber,
                    floorPlanName: sourceUnit.floorPlanName,
                    unitTypeName: sourceUnit.unitTypeName,
                    rawUnitPayload: sourceUnit.rawUnitPayload,
                    validationStatus: "PENDING",
                    transformStatus: "PENDING"
                }
            });
            try {
                await transformEntrataPropertyUnit(prisma, {
                    companyId,
                    organisationId,
                    integrationSourceId,
                    stagingPropertyUnitId: clonedUnit.id,
                    sourcePropertyId: demoPropertySourceRecordId,
                    sourceUnitId: demoUnitId,
                    remotePrimaryKey: clonedUnit.remotePrimaryKey,
                    rawUnitPayload: sourceUnit.rawUnitPayload
                });
                unitsTransformed++;
            }
            catch (error) {
                unitsFailed++;
                await prisma.stagingPropertyUnit.update({
                    where: { id: clonedUnit.id },
                    data: {
                        validationStatus: "INVALID",
                        transformStatus: "FAILED",
                        transformErrors: { message: error instanceof Error ? error.message : String(error) }
                    }
                });
                console.error(`[clone-demo-property] Unit ${demoUnitId} failed:`, error);
            }
        }
        await prisma.integrationSyncRun.update({
            where: { id: unitSyncRun.id },
            data: {
                status: unitsFailed > 0 && unitsTransformed > 0 ? "PARTIAL_FAILED" : unitsFailed > 0 ? "FAILED" : "COMPLETED",
                recordsReceived: sourceUnits.length,
                recordsStaged: sourceUnits.length,
                recordsProcessed: unitsTransformed,
                recordsFailed: unitsFailed,
                completedAt: new Date()
            }
        });
        await prisma.stagingApiBatch.update({
            where: { id: unitBatch.id },
            data: { status: "PARSED" }
        });
        console.log(`[clone-demo-property] Units done. Transformed: ${unitsTransformed}, failed: ${unitsFailed}.`);
    }
    // ── Step 9: clone unit types ──
    const sourceUnitTypes = await prisma.propertyUnitType.findMany({
        where: { companyId, organisationId, propertyId: sourceProperty.id },
        include: { floorplans: true, rentTerms: true }
    });
    // Delete existing demo unit types so reruns are clean (cascade handles children).
    await prisma.propertyUnitType.deleteMany({
        where: { companyId, organisationId, propertyId: demoProperty.id }
    });
    for (const ut of sourceUnitTypes) {
        const demoUnitType = await prisma.propertyUnitType.create({
            data: {
                companyId,
                organisationId,
                propertyId: demoProperty.id,
                sourceUnitTypeId: ut.sourceUnitTypeId ?? `DEMO-${ut.id}`,
                unitTypeName: ut.unitTypeName,
                unitCount: ut.unitCount,
                bedrooms: ut.bedrooms,
                bathrooms: ut.bathrooms,
                minSquareFeet: ut.minSquareFeet,
                maxSquareFeet: ut.maxSquareFeet,
                minMarketRent: ut.minMarketRent,
                maxMarketRent: ut.maxMarketRent,
                createdSource: "ENTRATA",
                updatedSource: "ENTRATA",
                lastSyncedAt: new Date()
            }
        });
        for (const fp of ut.floorplans) {
            await prisma.propertyUnitTypeFloorplan.create({
                data: {
                    companyId,
                    organisationId,
                    propertyUnitTypeId: demoUnitType.id,
                    sourceFloorPlanId: fp.sourceFloorPlanId,
                    floorPlanName: fp.floorPlanName
                }
            });
        }
        for (const rt of ut.rentTerms) {
            await prisma.propertyUnitTypeRentTerm.create({
                data: {
                    companyId,
                    organisationId,
                    propertyUnitTypeId: demoUnitType.id,
                    leaseTerm: rt.leaseTerm,
                    leaseTermId: rt.leaseTermId,
                    leaseTermName: rt.leaseTermName,
                    rent: rt.rent,
                    startDate: rt.startDate,
                    endDate: rt.endDate,
                    spaceOptionId: rt.spaceOptionId,
                    spaceOption: rt.spaceOption,
                    isSoldOut: rt.isSoldOut
                }
            });
        }
    }
    console.log(`[clone-demo-property] Unit types cloned: ${sourceUnitTypes.length}.`);
    // ── Step 10: clone GL trees (link demo property to the same GL trees) ──
    const sourceGlTrees = await prisma.propertyGlTree.findMany({
        where: { companyId, organisationId, propertyId: sourceProperty.id }
    });
    await prisma.propertyGlTree.deleteMany({
        where: { companyId, organisationId, propertyId: demoProperty.id }
    });
    for (const glTree of sourceGlTrees) {
        await prisma.propertyGlTree.create({
            data: {
                companyId,
                organisationId,
                propertyId: demoProperty.id,
                glTreeId: glTree.glTreeId,
                sourcePropertyId: demoPropertySourceRecordId,
                sourceGlTreeId: glTree.sourceGlTreeId,
                isPrimary: glTree.isPrimary,
                isActive: glTree.isActive,
                lastSyncedAt: new Date()
            }
        });
    }
    console.log(`[clone-demo-property] GL trees cloned: ${sourceGlTrees.length}.`);
    // ── Step 11: clone GL accounts (link demo property to the same GL accounts) ──
    const sourceGlAccounts = await prisma.propertyGlAccount.findMany({
        where: { companyId, organisationId, propertyId: sourceProperty.id }
    });
    await prisma.propertyGlAccount.deleteMany({
        where: { companyId, organisationId, propertyId: demoProperty.id }
    });
    // Map source PropertyGlAccount.id → cloned demo PropertyGlAccount.id (needed for budget actuals)
    const glAccountIdMap = new Map();
    for (const gla of sourceGlAccounts) {
        const demoGla = await prisma.propertyGlAccount.create({
            data: {
                companyId,
                organisationId,
                propertyId: demoProperty.id,
                glTreeId: gla.glTreeId,
                glAccountId: gla.glAccountId,
                sourcePropertyId: demoPropertySourceRecordId,
                sourceGlAccountId: gla.sourceGlAccountId,
                isActive: gla.isActive,
                lastSyncedAt: new Date()
            }
        });
        glAccountIdMap.set(gla.id, demoGla.id);
    }
    console.log(`[clone-demo-property] GL accounts cloned: ${sourceGlAccounts.length}.`);
    // ── Step 12: clone budgets → budget GL accounts → monthly amounts ──
    const sourceBudgets = await prisma.propertyBudget.findMany({
        where: { companyId, organisationId, propertyId: sourceProperty.id },
        include: { glAccounts: { include: { months: true } } }
    });
    // Delete existing demo budget actuals first (FK dependency), then budgets (cascade handles children).
    await prisma.propertyBudgetActual.deleteMany({
        where: { companyId, organisationId, propertyId: demoProperty.id }
    });
    await prisma.propertyBudget.deleteMany({
        where: { companyId, organisationId, propertyId: demoProperty.id }
    });
    const budgetIdMap = new Map();
    const budgetGlAccountIdMap = new Map();
    for (const budget of sourceBudgets) {
        const demoBudget = await prisma.propertyBudget.create({
            data: {
                companyId,
                organisationId,
                propertyId: demoProperty.id,
                sourceBudgetId: budget.sourceBudgetId,
                budgetName: budget.budgetName,
                budgetStatusTypeId: budget.budgetStatusTypeId,
                isDefault: budget.isDefault,
                fiscalYear: budget.fiscalYear,
                fiscalStartDate: budget.fiscalStartDate,
                fiscalEndDate: budget.fiscalEndDate,
                budgetTotal: budget.budgetTotal,
                currencyCode: budget.currencyCode,
                createdSource: "ENTRATA",
                updatedSource: "ENTRATA",
                lastSyncedAt: new Date()
            }
        });
        budgetIdMap.set(budget.id, demoBudget.id);
        for (const gla of budget.glAccounts) {
            const demoBudgetGla = await prisma.propertyBudgetGlAccount.create({
                data: {
                    companyId,
                    organisationId,
                    budgetId: demoBudget.id,
                    sourceGlAccountId: gla.sourceGlAccountId,
                    accountNumber: gla.accountNumber,
                    accountName: gla.accountName,
                    totalAmount: gla.totalAmount
                }
            });
            budgetGlAccountIdMap.set(gla.id, demoBudgetGla.id);
            for (const month of gla.months) {
                await prisma.propertyBudgetMonthlyAmount.create({
                    data: {
                        companyId,
                        organisationId,
                        budgetGlAccountId: demoBudgetGla.id,
                        monthDate: month.monthDate,
                        monthNo: month.monthNo,
                        fiscalYear: month.fiscalYear,
                        amount: month.amount
                    }
                });
            }
        }
    }
    console.log(`[clone-demo-property] Budgets cloned: ${sourceBudgets.length}.`);
    // ── Step 13: clone budget actuals ──
    const sourceBudgetActuals = await prisma.propertyBudgetActual.findMany({
        where: { companyId, organisationId, propertyId: sourceProperty.id }
    });
    let budgetActualsCloned = 0;
    for (const actual of sourceBudgetActuals) {
        const demoBudgetId = budgetIdMap.get(actual.budgetId);
        const demoBudgetGlAccountId = budgetGlAccountIdMap.get(actual.budgetGlAccountId);
        const demoPropertyGlAccountId = actual.propertyGlAccountId
            ? (glAccountIdMap.get(actual.propertyGlAccountId) ?? null)
            : null;
        if (!demoBudgetId || !demoBudgetGlAccountId) {
            console.warn(`[clone-demo-property] Skipping budget actual — no mapping for budgetId=${actual.budgetId} or budgetGlAccountId=${actual.budgetGlAccountId}`);
            continue;
        }
        await prisma.propertyBudgetActual.create({
            data: {
                companyId,
                organisationId,
                propertyId: demoProperty.id,
                budgetId: demoBudgetId,
                budgetGlAccountId: demoBudgetGlAccountId,
                glTreeId: actual.glTreeId,
                glAccountId: actual.glAccountId,
                propertyGlAccountId: demoPropertyGlAccountId,
                fiscalYear: actual.fiscalYear,
                postMonth: actual.postMonth,
                accountingMethod: actual.accountingMethod,
                mtdActual: actual.mtdActual,
                mtdBudget: actual.mtdBudget,
                mtdVariance: actual.mtdVariance,
                mtdVariancePercent: actual.mtdVariancePercent,
                ytdActual: actual.ytdActual,
                ytdBudget: actual.ytdBudget,
                ytdVariance: actual.ytdVariance,
                ytdVariancePercent: actual.ytdVariancePercent,
                annualBudget: actual.annualBudget,
                sourcePropertyId: demoPropertySourceRecordId,
                sourceBudgetId: actual.sourceBudgetId,
                sourceGlTreeId: actual.sourceGlTreeId,
                sourceGlAccountId: actual.sourceGlAccountId,
                lastSyncedAt: new Date()
            }
        });
        budgetActualsCloned++;
    }
    console.log(`[clone-demo-property] Budget actuals cloned: ${budgetActualsCloned}.`);
    console.log(`[clone-demo-property] Done.`);
    return {
        propertyTransformed: true,
        unitsTransformed,
        unitsFailed,
        unitTypesCloned: sourceUnitTypes.length,
        glTreesCloned: sourceGlTrees.length,
        glAccountsCloned: sourceGlAccounts.length,
        budgetsCloned: sourceBudgets.length,
        budgetActualsCloned
    };
}
//# sourceMappingURL=clone-demo-property.job.js.map