export interface EntrataPropertyRequestOptions {
    apiKey: string;
    baseUrl: string;
    orgSlug: string;
    requestId: string;
    propertyIds?: string[];
    showAllStatus?: boolean;
    propertyId?: string;
}
export declare function fetchEntrataProperties(options: EntrataPropertyRequestOptions): Promise<unknown>;
//# sourceMappingURL=entrata-property.connector.d.ts.map