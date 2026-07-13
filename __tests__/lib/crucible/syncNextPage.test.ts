/** @jest-environment node */
// sync.ts statically imports the auth helpers, which load Supabase at import
// time. We inject the token via dependencies, so stub the module out.
jest.mock("@/lib/auth/helpers", () => ({ getBungieToken: jest.fn() }));

import { claimCrucibleSync, syncNextCrucibleHistoryPage } from "@/lib/crucible/sync";

// Chainable Supabase stand-in for syncNextCrucibleHistoryPage:
//   bungie_accounts     -> .select().eq().single()
//   crucible_sync_state -> .select().eq().single() and .update().eq()
function makeDb(config: {
  account: Record<string, unknown>;
  state: Record<string, unknown>;
}) {
  const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];
  return {
    updates,
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        single: async () => ({
          data: table === "bungie_accounts" ? config.account : config.state,
          error: null,
        }),
        update(patch: Record<string, unknown>) {
          updates.push({ table, patch });
          return { eq: async () => ({ error: null }) };
        },
      };
      return builder;
    },
  };
}

function activity(instanceId: string, period = "2026-07-05T00:00:00.000Z") {
  return { period, activityDetails: { instanceId, referenceId: 1 } };
}

const baseState = {
  user_id: "user-1",
  status: "syncing",
  next_page: 3,
  character_ids: ["c1"],
  active_character_index: 0,
  sync_started_at: "2026-07-04T12:00:00.000Z",
  last_incremental_sync_at: null,
  backfill_completed_at: null,
  attempts: 1,
};

describe("syncNextCrucibleHistoryPage", () => {
  it("propagates a transient PGCR failure without advancing the cursor", async () => {
    const db = makeDb({
      account: { membership_id: "500", membership_type: 3 },
      state: { ...baseState },
    });

    await expect(
      syncNextCrucibleHistoryPage("user-1", {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        db: db as any,
        getToken: async () => "token",
        getHistoryPage: async () => [activity("1"), activity("2")],
        getPgcr: async () => {
          throw new Error("PGCR 1 fetch failed (429)");
        },
        resolveActivityDef: async () => ({ name: null, image: null, modes: [] }),
      })
    ).rejects.toThrow("429");

    // The page failed before the cursor write, so the same page is retried.
    expect(db.updates).toHaveLength(0);
  });

  it("advances the page cursor after a fully processed page", async () => {
    const db = makeDb({
      account: { membership_id: "500", membership_type: 3 },
      state: { ...baseState },
    });

    // 50 activities = a full page, so the same character continues on page 4.
    const fullPage = Array.from({ length: 50 }, (_, i) => activity(String(i)));
    const result = await syncNextCrucibleHistoryPage("user-1", {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db: db as any,
      getToken: async () => "token",
      getHistoryPage: async () => fullPage,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getPgcr: (async (id: string) => ({ instanceId: id })) as any,
      resolveActivityDef: async () => ({ name: null, image: null, modes: [] }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      importMatch: (async () => ({ imported: true, encounterCount: 0 })) as any,
    });

    expect(result).toEqual({ processedActivities: 50, importedMatches: 50, hasMore: true });
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0].patch).toMatchObject({ status: "queued", next_page: 4, active_character_index: 0 });
  });

  it("checkpoints the cycle start instead of its completion time", async () => {
    const db = makeDb({
      account: { membership_id: "500", membership_type: 3 },
      state: { ...baseState, next_page: 0 },
    });

    await syncNextCrucibleHistoryPage("user-1", {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      db: db as any,
      getToken: async () => "token",
      getHistoryPage: async () => [activity("1")],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getPgcr: (async () => ({ instanceId: "1" })) as any,
      resolveActivityDef: async () => ({ name: null, image: null, modes: [] }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      importMatch: (async () => ({ imported: true, encounterCount: 0 })) as any,
    });

    expect(db.updates[0].patch).toMatchObject({
      status: "complete",
      last_incremental_sync_at: baseState.sync_started_at,
      sync_started_at: null,
    });
  });

  it("claims work with a lease longer than the function timeout", async () => {
    const rpc = jest.fn(async () => ({ data: null, error: null }));
    await claimCrucibleSync("worker-1", undefined, { rpc });
    expect(rpc).toHaveBeenCalledWith("claim_crucible_sync", {
      p_worker_id: "worker-1",
      p_lock_seconds: 90,
    });
  });
});
