// Runs an async worker over a bounded collection while limiting in-flight
// work. Results preserve input order so callers can aggregate counters and
// diagnostics deterministically after all workers complete.
export async function mapWithConcurrency(items, concurrency, worker) {
  if (!Number.isSafeInteger(concurrency) || concurrency <= 0) {
    throw new TypeError("concurrency must be a positive safe integer");
  }

  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
