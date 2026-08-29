/** @jest-environment node */
// rotateCaptain writes three non-transactional statements (clear all flags,
// set the next captain's flag, record captain_user_id). supabase-js resolves
// with { error } rather than throwing, so before this all three errors were
// discarded. A failure between the clear and the set left NOBODY flagged
// captain: no client renders the roll controls, and reloading just reloads the
// same broken state.
//
// Also pins the retry-idempotency property that makes throwing safe: the
// current captain is derived from lobbies.captain_user_id (written last), so a
// retry after ANY partial failure re-picks the same next captain instead of
// skipping a player.

// This file loads lib/lobby via dynamic import (so the supabase mock can be
// swapped per test), leaving no top-level import/export. Without this marker
// TypeScript treats the file as a global script and collides with the
// identically-named helpers in rotateCaptain.test.ts.
export {};

interface FakeMember {
  id: string;
  lobby_id: string;
  user_id: string;
  is_captain: boolean;
  is_spectator: boolean;
  joined_at: string;
}

type Failures = {
  clearFlags?: boolean;
  setFlag?: boolean;
  lobbyUpdate?: boolean;
};

function makeFakeDb(
  members: FakeMember[],
  lobby: { id: string; captain_user_id: string },
  failures: Failures = {}
) {
  const err = (m: string) => ({ data: null, error: { message: m } });
  return {
    from(table: string) {
      if (table === "lobby_members") {
        const builder = {
          _filters: [] as Array<(m: FakeMember) => boolean>,
          select() {
            return this;
          },
          eq(col: string, val: unknown) {
            this._filters.push((m: FakeMember) => (m as unknown as Record<string, unknown>)[col] === val);
            return this;
          },
          order() {
            return this;
          },
          update(patch: Partial<FakeMember>) {
            const filters = this._filters;
            return {
              async eq(col: string, val: unknown) {
                // Distinguish the bulk clear (is_captain:false, by lobby_id)
                // from the single set (is_captain:true, by id).
                if (patch.is_captain === false && failures.clearFlags) return err("clear timed out");
                if (patch.is_captain === true && failures.setFlag) return err("set timed out");
                const allFilters = [
                  ...filters,
                  (m: FakeMember) => (m as unknown as Record<string, unknown>)[col] === val,
                ];
                for (const m of members) {
                  if (allFilters.every((f) => f(m))) Object.assign(m, patch);
                }
                return { data: null, error: null };
              },
            };
          },
          then(resolve: (v: { data: FakeMember[]; error: null }) => void) {
            const filtered = members.filter((m) => this._filters.every((f) => f(m)));
            resolve({ data: filtered, error: null });
          },
        };
        return builder;
      }
      if (table === "lobbies") {
        return {
          select() {
            return {
              eq() {
                return {
                  async single() {
                    return { data: lobby, error: null };
                  },
                };
              },
            };
          },
          update(patch: Partial<typeof lobby>) {
            return {
              async eq() {
                if (failures.lobbyUpdate) return err("lobby update timed out");
                Object.assign(lobby, patch);
                return { data: null, error: null };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function threeMembers(lobbyId: string): FakeMember[] {
  return [
    { id: "m-A", lobby_id: lobbyId, user_id: "A", is_captain: true, is_spectator: false, joined_at: "2026-01-01T00:00:00Z" },
    { id: "m-B", lobby_id: lobbyId, user_id: "B", is_captain: false, is_spectator: false, joined_at: "2026-01-01T00:01:00Z" },
    { id: "m-C", lobby_id: lobbyId, user_id: "C", is_captain: false, is_spectator: false, joined_at: "2026-01-01T00:02:00Z" },
  ];
}

describe("rotateCaptain partial-failure handling", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("throws instead of leaving the lobby with no captain when the set fails", async () => {
    const lobbyId = "lobby-1";
    const lobby = { id: lobbyId, captain_user_id: "A" };
    const members = threeMembers(lobbyId);

    jest.doMock("@/lib/supabase/admin", () => ({
      adminSupabase: makeFakeDb(members, lobby, { setFlag: true }),
    }));
    const { rotateCaptain } = await import("@/lib/lobby");

    // The wedge: flags are cleared, nobody is captain. This must not be silent.
    await expect(rotateCaptain(lobbyId)).rejects.toThrow(/set timed out/);
  });

  it("throws when the clear fails", async () => {
    const lobbyId = "lobby-2";
    const lobby = { id: lobbyId, captain_user_id: "A" };
    const members = threeMembers(lobbyId);

    jest.doMock("@/lib/supabase/admin", () => ({
      adminSupabase: makeFakeDb(members, lobby, { clearFlags: true }),
    }));
    const { rotateCaptain } = await import("@/lib/lobby");

    await expect(rotateCaptain(lobbyId)).rejects.toThrow(/clear timed out/);
  });

  it("throws when captain_user_id fails to persist", async () => {
    const lobbyId = "lobby-3";
    const lobby = { id: lobbyId, captain_user_id: "A" };
    const members = threeMembers(lobbyId);

    jest.doMock("@/lib/supabase/admin", () => ({
      adminSupabase: makeFakeDb(members, lobby, { lobbyUpdate: true }),
    }));
    const { rotateCaptain } = await import("@/lib/lobby");

    await expect(rotateCaptain(lobbyId)).rejects.toThrow(/lobby update timed out/);
  });

  it("a retry after the captain_user_id write failed re-picks the same captain, not the next one", async () => {
    const lobbyId = "lobby-4";
    const lobby = { id: lobbyId, captain_user_id: "A" };
    const members = threeMembers(lobbyId);

    // First attempt: flags land (A cleared, B set) but captain_user_id does not.
    jest.doMock("@/lib/supabase/admin", () => ({
      adminSupabase: makeFakeDb(members, lobby, { lobbyUpdate: true }),
    }));
    const mod = await import("@/lib/lobby");
    await expect(mod.rotateCaptain(lobbyId)).rejects.toThrow();

    expect(members.filter((m) => m.is_captain).map((m) => m.user_id)).toEqual(["B"]);
    expect(lobby.captain_user_id).toBe("A"); // never advanced

    // Retry with a healthy DB. Reading is_captain would find B and hand
    // captaincy to C, silently skipping B's turn. Reading captain_user_id
    // (still "A") re-picks B.
    jest.resetModules();
    jest.doMock("@/lib/supabase/admin", () => ({
      adminSupabase: makeFakeDb(members, lobby, {}),
    }));
    const retry = await import("@/lib/lobby");
    await retry.rotateCaptain(lobbyId);

    expect(members.filter((m) => m.is_captain).map((m) => m.user_id)).toEqual(["B"]);
    expect(lobby.captain_user_id).toBe("B");
  });
});
