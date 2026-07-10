/** @jest-environment node */
// sync.ts statically imports the auth helpers, which load Supabase at import
// time. We inject the token via dependencies, so stub the module out.
jest.mock("@/lib/auth/helpers", () => ({ getBungieToken: jest.fn() }));

import { syncRecentCrucibleHistory } from "@/lib/crucible/sync";

// Minimal chainable Supabase stand-in. syncRecentCrucibleHistory only reads:
//   bungie_accounts     -> .eq().maybeSingle()
//   crucible_sync_state -> .eq().maybeSingle()
//   crucible_matches    -> .in()  (existence check)
function makeDb(config: {
  account?: Record<string, unknown> | null;
  state?: Record<string, unknown> | null;
  existingMatchIds?: string[];
}) {
  return {
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({
          data: table === "bungie_accounts" ? config.account ?? null : config.state ?? null,
        }),
        in: async () => ({
          data: (config.existingMatchIds ?? []).map((instance_id) => ({ instance_id })),
        }),
      };
      return builder;
    },
  };
}

function activity(instanceId: string, period: string, referenceId = 1) {
  return { period, activityDetails: { instanceId, referenceId } };
}

describe("syncRecentCrucibleHistory", () => {
  it("imports only new matches newer than the cutoff, skipping already-imported ones", async () => {
    const imported: string[] = [];
    const db = makeDb({
      account: { membership_id: "500", membership_type: 3 },
      state: { character_ids: ["c1"], last_incremental_sync_at: "2026-07-01T00:00:00.000Z", backfill_completed_at: null },
      existingMatchIds: ["2"],
    });

    const result = await syncRecentCrucibleHistory("user-1", {
      db,
      getToken: async () => "token",
      getHistoryPage: async () => [
        activity("1", "2026-07-05T00:00:00.000Z"), // new -> import
        activity("2", "2026-07-04T00:00:00.000Z"), // already in crucible_matches -> skip
        activity("3", "2026-06-01T00:00:00.000Z"), // older than cutoff -> skip
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getPgcr: (async (id: string) => ({ instanceId: id })) as any,
      resolveActivityDef: async () => ({ name: "Rusted Lands", image: "/img/map.jpg" }),
      importMatch: (async (input: { rawPgcr: { instanceId: string } }) => {
        imported.push(input.rawPgcr.instanceId);
        return { imported: true, encounterCount: 1 };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    });

    expect(result).toEqual({ imported: 1 });
    expect(imported).toEqual(["1"]);
  });

  it("returns zero when the user has no linked Bungie account", async () => {
    const result = await syncRecentCrucibleHistory("user-1", {
      db: makeDb({ account: null }),
      getToken: async () => "token",
      getHistoryPage: async () => [activity("1", "2026-07-05T00:00:00.000Z")],
    });
    expect(result).toEqual({ imported: 0 });
  });

  it("fetches characters when the sync state has none cached", async () => {
    const seenCharacters: string[] = [];
    await syncRecentCrucibleHistory("user-1", {
      db: makeDb({ account: { membership_id: "500", membership_type: 3 }, state: null, existingMatchIds: [] }),
      getToken: async () => "token",
      getCharacters: async () => ["char-a", "char-b"],
      getHistoryPage: (async (_mt: number, _mid: string, characterId: string) => {
        seenCharacters.push(characterId);
        return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    });
    expect(seenCharacters).toEqual(["char-a", "char-b"]);
  });
});
