export interface EntrataPropertyUnitsRequestOptions {
    apiKey: string;
    baseUrl: string;
    orgSlug: string;
    requestId: string;
    propertyId: string;
    availableUnitsOnly?: boolean;
    usePropertyPreferences?: boolean;
    includeDisabledFloorplans?: boolean;
    includeDisabledUnits?: boolean;
}
export declare function fetchEntrataPropertyUnits(options: EntrataPropertyUnitsRequestOptions): Promise<unknown>;
//# sourceMappingURL=entrata-property-units.connector.d.ts.map