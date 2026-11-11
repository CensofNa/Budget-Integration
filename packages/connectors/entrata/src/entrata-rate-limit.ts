const sourceLocks = new Map<string, Promise<void>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface EntrataRateLimitOptions {
  key: string;
  minDelayMs: number;
}

export async function runWithEntrataRateLimit<T>(
  options: EntrataRateLimitOptions,
  action: () => Promise<T>
): Promise<T> {
  const previous = sourceLocks.get(options.key) ?? Promise.resolve();

  let release!: () => void;

  const current = new Promise<void>((resolve) => {
    release = resolve;
  });

  sourceLocks.set(
    options.key,
    previous.then(() => current)
  );

  await previous;

  try {
    await sleep(options.minDelayMs);
    return await action();
  } finally {
    release();

    if (sourceLocks.get(options.key) === current) {
      sourceLocks.delete(options.key);
    }
  }
}