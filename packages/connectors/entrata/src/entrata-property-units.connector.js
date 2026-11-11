import axios from "axios";
export async function fetchEntrataPropertyUnits(options) {
    const url = `${options.baseUrl}/ext/orgs/${options.orgSlug}/v1/propertyunits`;
    const payload = {
        auth: {
            type: "apikey"
        },
        requestId: options.requestId,
        method: {
            name: "getPropertyUnits",
            params: {
                propertyIds: options.propertyId,
                availableUnitsOnly: options.availableUnitsOnly ? "1" : "0",
                usePropertyPreferences: options.usePropertyPreferences ? "1" : "0",
                includeDisabledFloorplans: options.includeDisabledFloorplans ? "1" : "0",
                includeDisabledUnits: options.includeDisabledUnits ? "1" : "0"
            }
        }
    };
    const response = await axios.post(url, payload, {
        headers: {
            "Content-Type": "application/json",
            "X-Api-Key": options.apiKey
        },
        timeout: 120000 // 2 minutes to account for Entrata API latency
    });
    return response.data;
}
//# sourceMappingURL=entrata-property-units.connector.js.map