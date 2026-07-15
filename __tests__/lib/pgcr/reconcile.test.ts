/** @jest-environment node */
import { reconcilePendingPgcrs } from "@/lib/pgcr/reconcile";

interface Row {
  instance_id: string;
}

function makeDb(rows: Row[], remaining = rows.length) {
  return {
    from: () => {
      let head = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const builder: any = {
        select: (_columns: string, options?: { head?: boolean }) => {
          head = options?.head === true;
          return builder;
        },
        not: () => builder,
        is: () => builder,
        order: () => builder,
        limit: async (limit: number) => ({ data: rows.slice(0, limit), error: null }),
        then: (resolve: (value: unknown) => void) => resolve(
          head ? { count: remaining, error: null } : { data: rows, error: null },
        ),
      };
      return builder;
    },
  };
}

describe("reconcilePendingPgcrs", () => {
  it("archives pending rows in bounded concurrent chunks and reports failures", async () => {
    const rows = ["1", "2", "3"].map((instance_id) => ({ instance_id }));
    const archiveOne = jest.fn(async (instanceId: string) => instanceId === "2"
      ? { archived: false, cleared: false, archiveError: { kind: "transient", message: "timeout" } }
      : { archived: true, cleared: true });

    const result = await reconcilePendingPgcrs(
      { limit: 10, concurrency: 2 },
      { db: makeDb(rows, 1), archiveOne },
    );

    expect(archiveOne).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      selected: 3,
      attempted: 3,
      archived: 2,
      cleared: 2,
      failed: 1,
      deferred: 0,
      remaining: 1,
    });
    expect(result.failures).toEqual([{ instanceId: "2", kind: "transient", message: "timeout" }]);
  });

  it("stops starting chunks after the time budget and reports deferred rows", async () => {
    const rows = ["1", "2", "3", "4"].map((instance_id) => ({ instance_id }));
    let clock = 0;
    const archiveOne = jest.fn(async () => {
      clock += 600;
      return { archived: true, cleared: false };
    });

    const result = await reconcilePendingPgcrs(
      { limit: 10, concurrency: 2, timeBudgetMs: 1_000 },
      { db: makeDb(rows, 2), archiveOne, now: () => clock },
    );

    expect(archiveOne).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ attempted: 2, archived: 2, deferred: 2, remaining: 2 });
  });

  it("treats a checksum guard rejection as a visible failed retry", async () => {
    const archiveOne = jest.fn(async () => ({ archived: false, cleared: false }));

    const result = await reconcilePendingPgcrs(
      {},
      { db: makeDb([{ instance_id: "9" }], 1), archiveOne },
    );

    expect(result.failed).toBe(1);
    expect(result.failures[0]).toMatchObject({ instanceId: "9", kind: "guard_rejected" });
  });
});
