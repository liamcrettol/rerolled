/** @jest-environment node */
/**
 * Characterization tests for POST /api/roulette/roll (#223).
 *
 * roll.test.ts covers logging; this file pins the roll ORCHESTRATION behavior
 * ahead of the #224–#226 rework: no-duplicates history filtering, wildcard
 * slot writes, keep/reroll exclude construction, and slot upsert payloads.
 * rollLoadout itself is mocked — its engine behavior is characterized
 * separately in __tests__/lib/rollLoadout.test.ts.
 */
import { POST } from "@/app/api/roulette/roll/route";
import { NextRequest } from "next/server";
import { rollLoadout } from "@/lib/roulette/intersection";

jest.mock("@/lib/logger", () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    flush: jest.fn(),
  })),
}));

jest.mock("@/lib/auth/helpers", () => ({
  requireSession: jest.fn().mockResolvedValue({
    userId: "captain-1",
    displayName: "Captain",
    bungieMembershipType: 3,
    bungieMembershipId: "123",
  }),
}));

// Configurable per-test: previous-round slots returned by the nodup query.
let prevSlots: Array<{ slot: string; item_hash: number }> = [];
// Captured upserts to lobby_loadout_slots, in call order.
let upserts: Array<Record<string, unknown>> = [];

jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: {
    from: jest.fn((table: string) => {
      // Thenable chain: every builder method returns the chain; awaiting it
      // resolves to the configured result for the table/verb used.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {};
      let verb = "select";
      for (const m of ["select", "eq", "neq", "order", "limit"]) {
        chain[m] = jest.fn(() => chain);
      }
      chain.update = jest.fn(() => {
        verb = "update";
        return chain;
      });
      chain.upsert = jest.fn((row: Record<string, unknown>) => {
        upserts.push(row);
        return Promise.resolve({ error: null });
      });
      chain.single = jest.fn(() =>
        Promise.resolve({ data: { captain_user_id: "captain-1" }, error: null })
      );
      chain.then = (
        resolve: (v: unknown) => unknown,
        reject?: (e: unknown) => unknown
      ) => {
        const result =
          table === "lobby_loadout_slots" && verb === "select"
            ? { data: prevSlots, error: null }
            : { data: null, error: null };
        return Promise.resolve(result).then(resolve, reject);
      };
      return chain;
    }),
  },
}));

jest.mock("@/lib/roulette/intersection", () => ({
  rollLoadout: jest.fn().mockReturnValue({ kinetic: 1111, energy: 2222, power: null }),
}));

const WEAPON_DETAILS = {
  "1111": { name: "Kinetic Gun", icon: "/k.png", weaponType: "Auto Rifle", damageType: "Kinetic" },
  "1112": { name: "Other Kinetic", icon: "/k2.png", weaponType: "Hand Cannon", damageType: "Stasis" },
  "2222": { name: "Energy Gun", icon: "/e.png", weaponType: "Pulse Rifle", damageType: "Solar" },
  "3333": { name: "Power Gun", icon: "/p.png", weaponType: "Rocket Launcher", damageType: "Arc" },
};

function makeRequest(body: Record<string, unknown> = {}) {
  return new NextRequest("https://example.com/api/roulette/roll", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      lobbyId: "00000000-0000-0000-0000-000000000001",
      roundId: "00000000-0000-0000-0000-000000000002",
      intersection: { kinetic: [1111, 1112], energy: [2222], power: [3333] },
      weaponDetails: WEAPON_DETAILS,
      ...body,
    }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  prevSlots = [];
  upserts = [];
});

describe("POST /api/roulette/roll — no-duplicates mode", () => {
  it("filters weapons rolled in previous rounds out of the pool", async () => {
    prevSlots = [{ slot: "kinetic", item_hash: 1111 }];
    await POST(makeRequest({ nodup: true }));

    const [intersectionArg] = jest.mocked(rollLoadout).mock.calls[0];
    expect(intersectionArg.kinetic).toEqual([1112]);
    expect(intersectionArg.energy).toEqual([2222]); // untouched slots pass through
  });

  it("resets a slot's pool when history has exhausted it (cycle restarts)", async () => {
    prevSlots = [
      { slot: "kinetic", item_hash: 1111 },
      { slot: "kinetic", item_hash: 1112 },
    ];
    await POST(makeRequest({ nodup: true }));

    const [intersectionArg] = jest.mocked(rollLoadout).mock.calls[0];
    expect(intersectionArg.kinetic).toEqual([1111, 1112]);
  });

  it("does not query history at all when nodup is off", async () => {
    prevSlots = [{ slot: "kinetic", item_hash: 1111 }];
    await POST(makeRequest());

    const [intersectionArg] = jest.mocked(rollLoadout).mock.calls[0];
    expect(intersectionArg.kinetic).toEqual([1111, 1112]);
  });
});

describe("POST /api/roulette/roll — wildcard slots", () => {
  it("writes item_hash 0 for wildcard slots and empties their roll pool", async () => {
    await POST(makeRequest({ wildcardSlots: ["power"] }));

    expect(upserts[0]).toMatchObject({
      round_id: "00000000-0000-0000-0000-000000000002",
      slot: "power",
      item_hash: 0,
      weapon_name: "?",
      weapon_type: "Any",
      damage_type: "Any",
      locked_by_user_id: "captain-1",
    });

    const [intersectionArg] = jest.mocked(rollLoadout).mock.calls[0];
    expect(intersectionArg.power).toEqual([]);
    expect(intersectionArg.kinetic).toEqual([1111, 1112]);
  });

  it("never writes a rolled slot on top of a wildcard slot", async () => {
    jest.mocked(rollLoadout).mockReturnValueOnce({ kinetic: 1111, energy: 2222, power: 3333 });
    await POST(makeRequest({ wildcardSlots: ["power"] }));

    const powerWrites = upserts.filter((u) => u.slot === "power");
    expect(powerWrites).toHaveLength(1);
    expect(powerWrites[0].item_hash).toBe(0);
  });
});

describe("POST /api/roulette/roll — keep / reroll exclude construction", () => {
  it("passes keepSlots straight through as the exclude argument", async () => {
    await POST(makeRequest({ keepSlots: { energy: 2222 } }));

    const [, , excludeArg] = jest.mocked(rollLoadout).mock.calls[0];
    expect(excludeArg).toEqual({ energy: 2222 });
  });

  it("rerollSlot leaves its own slot unkept when keepSlots omits it (normal client behavior)", async () => {
    await POST(makeRequest({ rerollSlot: "kinetic", keepSlots: { energy: 2222 } }));

    const [, , excludeArg] = jest.mocked(rollLoadout).mock.calls[0];
    expect(excludeArg).toEqual({ kinetic: undefined, energy: 2222 });
  });

  it("QUIRK: a keepSlots entry for the reroll slot silently WINS over the reroll", async () => {
    // `{ [rerollSlot]: undefined, ...keepSlots }` spreads keepSlots second, so
    // a keep for the same slot overwrites the reroll-clear. The current client
    // never sends the reroll slot inside keepSlots, which is why this hasn't
    // surfaced — but it's a latent footgun for any future caller. If you're
    // changing this on purpose (reroll should probably win), update this test.
    await POST(
      makeRequest({ rerollSlot: "kinetic", keepSlots: { kinetic: 1111, energy: 2222 } })
    );

    const [, , excludeArg] = jest.mocked(rollLoadout).mock.calls[0];
    expect(excludeArg).toEqual({ kinetic: 1111, energy: 2222 });
  });

  it("forwards avoid and mode to the engine", async () => {
    await POST(makeRequest({ avoid: { kinetic: [1112] }, mode: "meta" }));

    const [, , , avoidArg, modeArg] = jest.mocked(rollLoadout).mock.calls[0];
    expect(avoidArg).toEqual({ kinetic: [1112] });
    expect(modeArg).toBe("meta");
  });
});

describe("POST /api/roulette/roll — slot writes", () => {
  it("upserts each rolled slot with its weapon details, keyed on round_id,slot", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    expect(upserts).toEqual([
      expect.objectContaining({
        round_id: "00000000-0000-0000-0000-000000000002",
        slot: "kinetic",
        item_hash: 1111,
        weapon_name: "Kinetic Gun",
        weapon_icon: "/k.png",
        weapon_type: "Auto Rifle",
        damage_type: "Kinetic",
        locked_by_user_id: "captain-1",
      }),
      expect.objectContaining({ slot: "energy", item_hash: 2222 }),
    ]);
  });

  it("skips slots the engine returned as null (no write, no error)", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(upserts.some((u) => u.slot === "power")).toBe(false);
  });

  it("skips rolled hashes that have no weaponDetails entry", async () => {
    jest.mocked(rollLoadout).mockReturnValueOnce({ kinetic: 9999, energy: 2222, power: null });
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    expect(upserts.some((u) => u.slot === "kinetic")).toBe(false);
    expect(upserts.some((u) => u.slot === "energy")).toBe(true);
  });

  it("returns the roll payload to the caller", async () => {
    const res = await POST(makeRequest());
    const body = await res.json();
    expect(body.roll).toEqual({ kinetic: 1111, energy: 2222, power: null });
  });
});
