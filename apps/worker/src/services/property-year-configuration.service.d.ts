export type SyncablePropertyForYear = {
    propertyId: string;
    propertyCode: string;
    propertyName: string | null;
};
export type SkippedPropertyForYear = {
    propertyCode: string;
    reason: "NOT_CONFIGURED_FOR_FISCAL_YEAR" | "INACTIVE_FOR_FISCAL_YEAR" | "DEMO_PROPERTY_EXCLUDED_FROM_ENTRATA_SYNC";
};
export type ResolveSyncablePropertiesResult = {
    properties: SyncablePropertyForYear[];
    skippedProperties: SkippedPropertyForYear[];
};
export declare function resolveSyncablePropertiesForFiscalYear(params: {
    companyId: string;
    organisationId: string;
    fiscalYear: number;
    propertyCodes?: string[];
    includeDemo?: boolean;
}): Promise<ResolveSyncablePropertiesResult>;
//# sourceMappingURL=property-year-configuration.service.d.ts.map