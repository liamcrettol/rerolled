// Generic bounded keyset-pagination sweep engine, shared by archive-mode and
// clear-mode passes in scripts/reconcile-pgcr-archive.mjs (and reusable by
// scripts/migrate-pgcr-to-appwrite.mjs's style of loop). Deliberately
// DB/Appwrite-agnostic - it only knows about `fetchPage`/`processRow`
// callbacks - so it's directly unit-testable with fakes
// (see __tests__/scripts/reconcileSweep.test.ts) without a real Postgres or
// Appwrite connection.
//
// Cursor semantics (this is the actual bug fix): after each page is
// fetched, the cursor advances to the last row's key REGARDLESS of whether
// any row in that page succeeded, failed, or was skipped by a dry run. This
// is what makes a single call terminate - bounded by the table's size (or
// `limit`), never by how many rows succeeded - and what stops a row that
// fails every time from blocking every row after it. A later invocation
// re-queries from the start and naturally retries whatever's still
// eligible; it never gets stuck retrying the same row inside one run.

/**
 * @param {object} opts
 * @param {(cursor: string, pageSize: number) => Promise<any[]>} opts.fetchPage
 *   Returns up to `pageSize` rows with key > cursor, ordered by key ascending.
 * @param {(row: any) => Promise<Record<string, number> | void>} opts.processRow
 *   Processes one row and returns a partial map of counter deltas to add
 *   (e.g. `{ uploaded: 1 }`) - never mutates cursor/pagination state. `row`
 *   is intentionally `any`, not `unknown`: callers pass concretely-shaped
 *   rows (real pg rows, or typed fakes in tests) and TS's strict function
 *   variance would otherwise reject a more specific callback here.
 * @param {(row: any) => string} opts.keyOf
 *   Extracts the keyset cursor value from a row.
 * @param {number} opts.batchSize
 * @param {number | null} [opts.limit]
 *   Total row cap across the whole sweep. null/undefined = unbounded (the
 *   sweep still terminates once every eligible row has been visited once).
 * @param {number} [opts.concurrency]
 *   How many processRow() calls run in parallel within a single fetched
 *   page (default 1 = sequential). Only affects throughput within a page -
 *   the cursor still advances once per whole page, unconditionally, so this
 *   never changes the pagination/termination guarantees above.
 * @param {(row: any, error: unknown) => void} [opts.onUnexpectedError]
 *   Receives the row identity for an unexpected processRow exception so the
 *   caller can persist an actionable failure record.
 * @returns {Promise<Record<string, number> & { inspected: number, pages: number }>}
 */
export async function runSweep({ fetchPage, processRow, keyOf, batchSize, limit = null, concurrency = 1, onUnexpectedError }) {
  const counts = { inspected: 0, pages: 0 };
  let cursor = "";

  for (;;) {
    const remaining = limit != null ? limit - counts.inspected : null;
    if (remaining != null && remaining <= 0) break;
    const pageSize = remaining != null ? Math.min(batchSize, remaining) : batchSize;

    const rows = await fetchPage(cursor, pageSize);
    if (rows.length === 0) break;
    counts.pages++;
    // Cursor advances here, before any row is processed, so it is
    // unconditional - a row that throws or fails below can never prevent
    // the next page from being fetched on the next loop iteration.
    cursor = keyOf(rows[rows.length - 1]);

    const applyDelta = (delta) => {
      for (const [key, value] of Object.entries(delta ?? {})) {
        counts[key] = (counts[key] ?? 0) + value;
      }
    };

    const queue = [...rows];
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      for (;;) {
        const row = queue.shift();
        if (row === undefined) return;
        counts.inspected++;
        try {
          applyDelta(await processRow(row));
        } catch (err) {
          onUnexpectedError?.(row, err);
          applyDelta({ failed: 1 });
        }
      }
    });
    await Promise.all(workers);

    if (rows.length < pageSize) break; // last page
  }

  return counts;
}
