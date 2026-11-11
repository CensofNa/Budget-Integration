const sourceLocks = new Map();
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export async function runWithEntrataRateLimit(options, action) {
    const previous = sourceLocks.get(options.key) ?? Promise.resolve();
    let release;
    const current = new Promise((resolve) => {
        release = resolve;
    });
    sourceLocks.set(options.key, previous.then(() => current));
    await previous;
    try {
        await sleep(options.minDelayMs);
        return await action();
    }
    finally {
        release();
        if (sourceLocks.get(options.key) === current) {
            sourceLocks.delete(options.key);
        }
    }
}
//# sourceMappingURL=entrata-rate-limit.js.map