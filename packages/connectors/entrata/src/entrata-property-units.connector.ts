import axios from "axios";


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


export async function fetchEntrataPropertyUnits(
  options: EntrataPropertyUnitsRequestOptions
): Promise<unknown> {
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
    timeout: 120000  // 2 minutes to account for Entrata API latency
  });

  return response.data;
}