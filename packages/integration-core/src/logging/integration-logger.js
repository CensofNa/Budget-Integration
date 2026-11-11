function isProduction() {
    return (process.env.NODE_ENV ===
        "production");
}
export function logInfo(message, context) {
    console.log(`[INFO] ${message}`, context ?? "");
}
export function logWarn(message, context) {
    console.warn(`[WARN] ${message}`, context ?? "");
}
export async function logError(prisma, message, error, context) {
    console.error(`[ERROR] ${message}`, {
        error,
        context
    });
    if (!isProduction()) {
        return;
    }
    if (!context.companyId ||
        !context.organisationId ||
        !context.entityName ||
        !context.queueName ||
        !context.jobName ||
        !context.bullJobId) {
        console.error("[ERROR] Skipped DB error logging because required logging context is missing.", context);
        return;
    }
    // await logIntegrationError(
    //   prisma,
    //   {
    //     companyId: context.companyId,
    //     organisationId:
    //       context.organisationId,
    //     integrationSourceId:
    //       context.integrationSourceId ??
    //       "",
    //     syncRunId:
    //       context.syncRunId ?? "",
    //     entityName: context.entityName,
    //     queueName: context.queueName,
    //     jobName: context.jobName,
    //     bullJobId: context.bullJobId,
    //     contextJson:
    //       context.contextJson &&
    //       typeof context.contextJson ===
    //         "object"
    //         ? (context.contextJson as Record<
    //             string,
    //             unknown
    //           >)
    //         : {}
    //   },
    //   error
    // );
}
//# sourceMappingURL=integration-logger.js.map