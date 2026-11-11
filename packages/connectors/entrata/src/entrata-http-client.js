import axios from "axios";
import https from "node:https";
import { runWithEntrataRateLimit } from "./entrata-rate-limit.js";
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
const httpsAgent = new https.Agent({
    keepAlive: false
});
function getRetryDelayMs(error, fallbackMs) {
    if (!axios.isAxiosError(error)) {
        return fallbackMs;
    }
    const headers = error.response?.headers ?? {};
    const retryAfter = headers["retry-after"];
    if (retryAfter) {
        const retryAfterSeconds = Number(retryAfter);
        if (Number.isFinite(retryAfterSeconds)) {
            return retryAfterSeconds * 1000;
        }
    }
    const reset = headers["x-rate-limit-reset"];
    if (reset) {
        const resetNumber = Number(reset);
        if (Number.isFinite(resetNumber)) {
            const now = Date.now();
            // Entrata/APIGateway reset values are often epoch milliseconds.
            if (resetNumber > now) {
                return Math.max(resetNumber - now + 250, fallbackMs);
            }
        }
    }
    return fallbackMs;
}
function isRetryable(error) {
    if (!axios.isAxiosError(error)) {
        return false;
    }
    const status = error.response?.status;
    return (status === 429 ||
        status === 500 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        error.code === "ECONNRESET" ||
        error.code === "ETIMEDOUT" ||
        error.code === "ECONNABORTED" // This can occur on Axios timeouts
    );
}
export async function entrataRequest(options) {
    const minDelayMs = options.minDelayMs ?? 1200;
    const maxRetries = options.maxRetries ?? 5;
    const retryBaseDelayMs = options.retryBaseDelayMs ?? 2000;
    return runWithEntrataRateLimit({
        key: options.rateLimitKey,
        minDelayMs
    }, async () => {
        let attempt = 0;
        while (true) {
            try {
                // console.log(`Entrata request attempt ${attempt + 1}/${maxRetries + 1}.`, {
                //   url: options.axiosConfig.url,
                //   method: options.axiosConfig.method,
                //   timeout: options.axiosConfig.timeout,
                //   rateLimitKey: options.rateLimitKey
                // });
                const response = await axios.request({
                    ...options.axiosConfig,
                    timeout: options.axiosConfig.timeout ?? 30000,
                    httpsAgent
                });
                console.log("Entrata request completed.", {
                    status: response.status
                });
                return response.data;
                // console.log(`Entrata request attempt ${attempt + 1}/${maxRetries + 1}.`);
                // const response = await axios.request<T>(options.axiosConfig);
                // console.log("Entrata request succeeded.");
                // return response.data;
            }
            catch (error) {
                console.error("Entrata request failed.", {
                    rateLimitKey: options.rateLimitKey,
                    status: axios.isAxiosError(error) ? error.response?.status : undefined,
                    code: axios.isAxiosError(error) ? error.code : undefined,
                    message: error instanceof Error ? error.message : String(error)
                });
                attempt++;
                if (!isRetryable(error) || attempt > maxRetries) {
                    throw error;
                }
                const retryDelayMs = getRetryDelayMs(error, retryBaseDelayMs * Math.pow(2, attempt - 1));
                console.warn(`Entrata request retrying. Attempt ${attempt}/${maxRetries}. Delay: ${retryDelayMs}ms. Status: ${axios.isAxiosError(error) ? error.response?.status : "unknown"}`);
                await sleep(retryDelayMs);
                console.log(`Entrata retry delay completed. Retrying attempt ${attempt + 1}/${maxRetries + 1}.`);
            }
        }
    });
}
//# sourceMappingURL=entrata-http-client.js.map