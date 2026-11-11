export interface CloneDemoPropertyJobInput {
    companyId: string;
    organisationId: string;
    integrationSourceId: string;
    sourcePropertyCode: string;
    targetPropertyCode: string;
    demoPropertyName?: string;
}
export interface CloneDemoPropertyJobResult {
    propertyTransformed: boolean;
    unitsTransformed: number;
    unitsFailed: number;
    unitTypesCloned: number;
    glTreesCloned: number;
    glAccountsCloned: number;
    budgetsCloned: number;
    budgetActualsCloned: number;
}
export declare function cloneDemoPropertyJob(input: CloneDemoPropertyJobInput): Promise<CloneDemoPropertyJobResult>;
//# sourceMappingURL=clone-demo-property.job.d.ts.map