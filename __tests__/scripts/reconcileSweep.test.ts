/** @jest-environment node */
import { runSweep } from "../../scripts/lib/reconcileSweep.mjs";

interface FakeRow {
  instance_id: string;
}

// Builds a fetchPage() over an in-memory "table" sorted by instance_id, the
// same keyset shape the real SQL queries use (`instance_id > cursor ORDER BY
// instance_id LIMIT pageSize`).
function makeFetchPage(table: FakeRow[]) {
  const calls: Array<{ cursor: string; pageSize: number }> = [];
  const fetchPage = async (cursor: string, pageSize: number): Promise<FakeRow[]> => {
    calls.push({ cursor, pageSize });
    return table.filter((row) => row.instance_id > cursor).slice(0, pageSize);
  };
  return { fetchPage, calls };
}

function ids(n: number, prefix = "id-"): FakeRow[] {
  // Zero-padded so plain string comparison sorts the same as numeric order.
  return Array.from({ length: n }, (_, i) => ({ instance_id: `${prefix}${String(i).padStart(4, "0")}` }));
}

describe("runSweep", () => {
  it("terminates an unbounded dry-run sweep once every row has been visited once", async () => {
    const table = ids(37);
    const { fetchPage } = makeFetchPage(table);
    const processRow = jest.fn(async () => ({ dryRun: 1 }));

    const counts = await runSweep({
      fetchPage,
      processRow,
      keyOf: (row: FakeRow) => row.instance_id,
      batchSize: 10,
      // limit intentionally omitted - this is the "unbounded" case.
    });

    expect(counts.inspected).toBe(37);
    expect(counts.dryRun).toBe(37);
    expect(processRow).toHaveBeenCalledTimes(37);
  });

  it("does not let a permanently failing row block rows after it", async () => {
    const table = ids(5);
    const { fetchPage } = makeFetchPage(table);
    const processRow = jest.fn(async (row: FakeRow) => {
      if (row.instance_id === table[0].instance_id) throw new Error("permanent failure");
      return { verified: 1 };
    });

    const counts = await runSweep({
      fetchPage,
      processRow,
      keyOf: (row: FakeRow) => row.instance_id,
      batchSize: 10,
    });

    expect(counts.inspected).toBe(5);
    expect(counts.failed).toBe(1);
    expect(counts.verified).toBe(4);
    expect(processRow).toHaveBeenCalledTimes(5);
  });

  it("terminates a batch where every row fails", async () => {
    const table = ids(12);
    const { fetchPage } = makeFetchPage(table);
    const processRow = jest.fn(async () => {
      throw new Error("always fails");
    });

    const counts = await runSweep({
      fetchPage,
      processRow,
      keyOf: (row: FakeRow) => row.instance_id,
      batchSize: 5,
    });

    expect(counts.inspected).toBe(12);
    expect(counts.failed).toBe(12);
  });

  it("reports the row identity when processRow throws unexpectedly", async () => {
    const table = ids(3);
    const { fetchPage } = makeFetchPage(table);
    const onUnexpectedError = jest.fn();

    const counts = await runSweep({
      fetchPage,
      processRow: async (row: FakeRow) => {
        if (row.instance_id === table[1].instance_id) throw new Error("boom");
        return { ok: 1 };
      },
      keyOf: (row: FakeRow) => row.instance_id,
      batchSize: 3,
      onUnexpectedError,
    });

    expect(counts.failed).toBe(1);
    expect(onUnexpectedError).toHaveBeenCalledWith(table[1], expect.any(Error));
  });

  it("advances the cursor monotonically and never re-requests the same page", async () => {
    const table = ids(23);
    const { fetchPage, calls } = makeFetchPage(table);
    const processRow = jest.fn(async () => ({ ok: 1 }));

    await runSweep({
      fetchPage,
      processRow,
      keyOf: (row: FakeRow) => row.instance_id,
      batchSize: 7,
    });

    // 23 rows / batch 7 -> pages of 7,7,7,2 = 4 fetchPage calls.
    expect(calls).toHaveLength(4);
    expect(calls[0].cursor).toBe("");
    for (let i = 1; i < calls.length; i++) {
      expect(calls[i].cursor > calls[i - 1].cursor).toBe(true);
    }
    // Each cursor is exactly the previous page's last row.
    expect(calls[1].cursor).toBe(table[6].instance_id);
    expect(calls[2].cursor).toBe(table[13].instance_id);
    expect(calls[3].cursor).toBe(table[20].instance_id);
  });

  it("stops once the row cap (--limit) is reached, even with rows still eligible", async () => {
    const table = ids(50);
    const { fetchPage } = makeFetchPage(table);
    const processRow = jest.fn(async () => ({ ok: 1 }));

    const counts = await runSweep({
      fetchPage,
      processRow,
      keyOf: (row: FakeRow) => row.instance_id,
      batchSize: 10,
      limit: 25,
    });

    expect(counts.inspected).toBe(25);
  });

  it("terminates immediately when the table is empty", async () => {
    const { fetchPage, calls } = makeFetchPage([]);
    const processRow = jest.fn();

    const counts = await runSweep({
      fetchPage,
      processRow,
      keyOf: (row: FakeRow) => row.instance_id,
      batchSize: 10,
    });

    expect(counts.inspected).toBe(0);
    expect(calls).toHaveLength(1);
    expect(processRow).not.toHaveBeenCalled();
  });
});
