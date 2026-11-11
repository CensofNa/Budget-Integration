export class IntegrationError extends Error {
    code;
    category;
    severity;
    retryable;
    context;
    constructor(options) {
        super(options.message);
        this.name = "IntegrationError";
        this.code = options.code;
        this.category = options.category;
        this.retryable = options.retryable ?? false;
        this.severity = options.severity ?? "ERROR";
        this.context = options.context;
        if (options.cause) {
            this.cause = options.cause;
        }
    }
}
//# sourceMappingURL=integration-error.js.map