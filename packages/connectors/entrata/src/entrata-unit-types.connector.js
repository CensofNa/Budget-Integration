import axios from "axios";
export async function fetchEntrataUnitTypes(options) {
    const url = `${options.baseUrl}/ext/orgs/${options.orgSlug}/v1/propertyunits`;
    const payload = {
        auth: {
            type: "apikey"
        },
        requestId: options.requestId,
        method: {
            name: "getUnitTypes",
            params: {
                propertyId: options.propertyId
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
//# sourceMappingURL=entrata-unit-types.connector.js.map