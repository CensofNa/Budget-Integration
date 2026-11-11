import axios from "axios";

export interface EntrataUnitTypesRequestOptions {
  apiKey: string;
  baseUrl: string;
  orgSlug: string;
  requestId: string;
  propertyId: string;
}

export async function fetchEntrataUnitTypes(
  options: EntrataUnitTypesRequestOptions
): Promise<unknown> {
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
    timeout: 120000  // 2 minutes to account for Entrata API latency
  });

  return response.data;
}