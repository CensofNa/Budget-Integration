import axios from "axios";

export interface EntrataPropertyRequestOptions {
  apiKey: string;
  baseUrl: string;
  orgSlug: string;
  requestId: string;
  propertyIds?: string[];
  showAllStatus?: boolean;
  propertyId?: string;
}

export async function fetchEntrataProperties(options: EntrataPropertyRequestOptions): Promise<unknown> {
  const url = `${options.baseUrl}/ext/orgs/${options.orgSlug}/v1/properties`;

  const payload = {
    auth: {
      type: "apikey"
    },
    requestId: options.requestId,
    method: {
      name: "getProperties",
      version: "r1",
      params: {
        ...(options.propertyId
          ? { propertyIds: options.propertyId }
          : options.propertyIds && options.propertyIds.length > 0
            ? { propertyIds: options.propertyIds.join(",") }
            : {}),

        showAllStatus: options.showAllStatus ? "1" : "0"
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
