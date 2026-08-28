/** @jest-environment node */
// rotateCaptain had zero direct test coverage (__tests__/api/apply.test.ts mocks
// it away entirely), so a regression here could ship unnoticed. Exercises it
// against a stateful fake DB across several consecutive rounds, since the
// reported bug is specifically "rotates once, then gets stuck."

interface FakeMember {
  id: string;
  lobby_id: string;
  user_id: string;
  is_captain: boolean;
  is_spectator: boolean;
  joined_at: string;
}

function makeFakeDb(members: FakeMember[], lobby: { id: string; captain_user_id: string }) {
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
                const allFilters = [...filters, (m: FakeMember) => (m as unknown as Record<string, unknown>)[col] === val];
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
                return { async single() { return { data: lobby, error: null }; } };
              },
            };
          },
          update(patch: Partial<typeof lobby>) {
            return {
              async eq() {
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

describe("rotateCaptain", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("advances through every member in join order across consecutive rounds, wrapping around", async () => {
    const lobbyId = "lobby-1";
    const lobby = { id: lobbyId, captain_user_id: "A" };
    const members: FakeMember[] = [
      { id: "m-A", lobby_id: lobbyId, user_id: "A", is_captain: true, is_spectator: false, joined_at: "2026-01-01T00:00:00Z" },
      { id: "m-B", lobby_id: lobbyId, user_id: "B", is_captain: false, is_spectator: false, joined_at: "2026-01-01T00:01:00Z" },
      { id: "m-C", lobby_id: lobbyId, user_id: "C", is_captain: false, is_spectator: false, joined_at: "2026-01-01T00:02:00Z" },
    ];

    jest.doMock("@/lib/supabase/admin", () => ({ adminSupabase: makeFakeDb(members, lobby) }));
    const { rotateCaptain } = await import("@/lib/lobby");

    await rotateCaptain(lobbyId);
    expect(members.find((m) => m.user_id === "B")?.is_captain).toBe(true);
    expect(members.filter((m) => m.is_captain).map((m) => m.user_id)).toEqual(["B"]);
    expect(lobby.captain_user_id).toBe("B");

    await rotateCaptain(lobbyId);
    expect(members.filter((m) => m.is_captain).map((m) => m.user_id)).toEqual(["C"]);
    expect(lobby.captain_user_id).toBe("C");

    await rotateCaptain(lobbyId);
    expect(members.filter((m) => m.is_captain).map((m) => m.user_id)).toEqual(["A"]);
    expect(lobby.captain_user_id).toBe("A");

    await rotateCaptain(lobbyId);
    expect(members.filter((m) => m.is_captain).map((m) => m.user_id)).toEqual(["B"]);
    expect(lobby.captain_user_id).toBe("B");
  });

  it("recovers from a desync (no member flagged captain) by advancing from lobbies.captain_user_id, not member 0", async () => {
    // Simulates the drifted state joinLobby's rejoin-upsert used to leave behind
    // (see the fix in lib/lobby/index.ts's joinLobby): lobby_members.is_captain is
    // false for everyone even though lobbies.captain_user_id still names "B".
    // Rotation should advance from B (-> C), not silently reset to whoever joined
    // first.
    const lobbyId = "lobby-2";
    const lobby = { id: lobbyId, captain_user_id: "B" };
    const members: FakeMember[] = [
      { id: "m-A", lobby_id: lobbyId, user_id: "A", is_captain: false, is_spectator: false, joined_at: "2026-01-01T00:00:00Z" },
      { id: "m-B", lobby_id: lobbyId, user_id: "B", is_captain: false, is_spectator: false, joined_at: "2026-01-01T00:01:00Z" },
      { id: "m-C", lobby_id: lobbyId, user_id: "C", is_captain: false, is_spectator: false, joined_at: "2026-01-01T00:02:00Z" },
    ];

    jest.doMock("@/lib/supabase/admin", () => ({ adminSupabase: makeFakeDb(members, lobby) }));
    const { rotateCaptain } = await import("@/lib/lobby");

    await rotateCaptain(lobbyId);

    expect(members.filter((m) => m.is_captain).map((m) => m.user_id)).toEqual(["C"]);
    expect(lobby.captain_user_id).toBe("C");
  });
});
