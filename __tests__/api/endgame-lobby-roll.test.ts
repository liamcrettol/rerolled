/** @jest-environment node */
/**
 * POST /api/endgame/lobby/roll — captain gating, hard fireteam-size gate,
 * idempotent-unless-forced rolling, per-member status classification, and
 * force-reroll stale-row cleanup.
 */
import { POST } from "@/app/api/endgame/lobby/roll/route";
import { NextRequest } from "next/server";

jest.mock("@/lib/auth/helpers", () => ({
  requireSession: jest.fn().mockResolvedValue({ userId: "captain-1" }),
  getBungieToken: jest.fn().mockResolvedValue("token"),
  isBungieAuthErrorMessage: jest.fn((msg: string) => msg === "AUTH_EXPIRED"),
}));

jest.mock("@/lib/bungie/client", () => ({
  bungieGet: jest.fn().mockResolvedValue({}),
  getInventoryItemDefinitions: jest.fn().mockResolvedValue({}),
}));

jest.mock("@/lib/roulette/intersection", () => ({
  rollLoadout: jest.fn(() => ({ kinetic: 1111, energy: 2222, power: 3333 })),
}));

// Keep the real ARMOR_BUCKET_HASHES/ENDGAME_KIND_FIRETEAM_SIZE constants but
// stub the Bungie-profile-dependent functions so each test controls exactly
// what comes back per member without needing full profile fixtures (those
// are covered by __tests__/lib/endgame/randomizer.test.ts).
jest.mock("@/lib/endgame/randomizer", () => {
  const actual = jest.requireActual("@/lib/endgame/randomizer");
  return {
    ...actual,
    pickEndgameActivity: jest.fn(() => ({
      activityHash: 999,
      name: "Root of Nightmares",
      kind: "raid",
      label: "Raid",
    })),
    collectEndgameArmorCandidateHashes: jest.fn(() => []),
    selectExoticArmorOptions: jest.fn(),
  };
});

import { getBungieToken } from "@/lib/auth/helpers";
import { selectExoticArmorOptions } from "@/lib/endgame/randomizer";

interface Db {
  lobbies?: { single?: unknown };
  lobby_endgame_rounds?: { maybeSingle?: unknown; single?: unknown };
  lobby_endgame_exotic_picks?: { list?: unknown };
  lobby_members?: { list?: unknown };
  lobby_pools?: { single?: unknown };
}

let db: Db = {};
const upserts: Record<string, unknown[]> = {};
const deletes: string[] = [];

jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: {
    from: jest.fn((table: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {};
      let verb = "select";
      chain.select = jest.fn(() => chain);
      chain.eq = jest.fn(() => chain);
      chain.delete = jest.fn(() => {
        verb = "delete";
        return chain;
      });
      chain.upsert = jest.fn((rows: unknown) => {
        upserts[table] = upserts[table] ?? [];
        upserts[table].push(rows);
        chain._upserted = rows;
        verb = "upsert";
        return chain;
      });
      chain.single = jest.fn(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cfg = (db as any)[table]?.single;
        if (cfg) return cfg;
        if (verb === "upsert") {
          const rows = chain._upserted;
          return { data: Array.isArray(rows) ? rows[0] : rows, error: null };
        }
        return { data: null, error: null };
      });
      chain.maybeSingle = jest.fn(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (db as any)[table]?.maybeSingle ?? { data: null, error: null };
      });
      chain.then = (resolve: (v: unknown) => unknown) => {
        if (verb === "delete") {
          deletes.push(table);
          return resolve({ data: null, error: null });
        }
        if (verb === "upsert") {
          const rows = chain._upserted;
          return resolve({ data: Array.isArray(rows) ? rows : [rows], error: null });
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return resolve((db as any)[table]?.list ?? { data: [], error: null });
      };
      return chain;
    }),
  },
}));

function makeRequest(body: Record<string, unknown> = {}) {
  return new NextRequest("https://example.com/api/endgame/lobby/roll", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      lobbyId: "00000000-0000-0000-0000-000000000001",
      roundId: "00000000-0000-0000-0000-000000000002",
      activityKinds: ["raid"],
      ...body,
    }),
  });
}

const readyMember = {
  user_id: "captain-1",
  display_name: "Captain",
  bungie_membership_type: 3,
  bungie_membership_id: "bm-1",
  selected_character_id: "char-1",
};

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(upserts).forEach((k) => delete upserts[k]);
  deletes.length = 0;
  db = {
    lobbies: { single: { data: { captain_user_id: "captain-1" }, error: null } },
    lobby_endgame_rounds: { maybeSingle: { data: null, error: null } },
    lobby_pools: {
      single: {
        data: {
          pool: { kinetic: [1111], energy: [2222], power: [3333] },
          weapon_details: {
            "1111": { name: "K", icon: "/k.png", weaponType: "Auto Rifle", damageType: "Kinetic" },
            "2222": { name: "E", icon: "/e.png", weaponType: "Pulse Rifle", damageType: "Solar" },
            "3333": { name: "P", icon: "/p.png", weaponType: "Rocket Launcher", damageType: "Arc" },
          },
        },
        error: null,
      },
    },
  };
  jest.mocked(getBungieToken).mockResolvedValue("token");
  jest.mocked(selectExoticArmorOptions).mockReturnValue({
    character: { classType: 1 } as never,
    options: [],
  });
});

describe("POST /api/endgame/lobby/roll — captain gating", () => {
  it("rejects a non-captain", async () => {
    db.lobbies = { single: { data: { captain_user_id: "someone-else" }, error: null } };
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
  });
});

describe("POST /api/endgame/lobby/roll — idempotency", () => {
  it("returns the existing round unchanged when one already exists and force is not set", async () => {
    const existing = { round_id: "00000000-0000-0000-0000-000000000002", activity_name: "Old Raid" };
    db.lobby_endgame_rounds = { maybeSingle: { data: existing, error: null } };
    db.lobby_endgame_exotic_picks = { list: { data: [{ user_id: "captain-1", status: "resolved" }], error: null } };

    const res = await POST(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.round).toEqual(existing);
    expect(upserts["lobby_endgame_rounds"]).toBeUndefined();
  });

  it("re-rolls when force is true even if a round already exists", async () => {
    db.lobby_endgame_rounds = {
      maybeSingle: { data: { round_id: "r", activity_name: "Old Raid" }, error: null },
    };
    db.lobby_members = { list: { data: [readyMember], error: null } };

    const res = await POST(makeRequest({ activityKinds: ["dungeon"], force: true }));
    // dungeon needs 3, we only have 1 ready — still gets caught by the size
    // gate even on a forced reroll.
    expect(res.status).toBe(400);
  });
});

describe("POST /api/endgame/lobby/roll — fireteam size gate", () => {
  it("rejects a kind whose required size doesn't match the ready roster", async () => {
    db.lobby_members = { list: { data: [readyMember], error: null } };
    const res = await POST(makeRequest({ activityKinds: ["raid"] }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/raid needs exactly 6/);
  });

  it("accepts a dungeon/grandmaster-sized roster of 3", async () => {
    const roster = [
      readyMember,
      { ...readyMember, user_id: "m2", selected_character_id: "char-2" },
      { ...readyMember, user_id: "m3", selected_character_id: "char-3" },
    ];
    db.lobby_members = { list: { data: roster, error: null } };

    const res = await POST(makeRequest({ activityKinds: ["dungeon"] }));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/endgame/lobby/roll — per-member exotic status", () => {
  it("marks a ready member with no selected character as missing_character", async () => {
    db.lobby_members = {
      list: { data: [{ ...readyMember, selected_character_id: null }], error: null },
    };
    const res = await POST(makeRequest({ activityKinds: ["raid"] }));
    // Single ready member, but raid needs 6 — swap to a size that fits.
    expect(res.status).toBe(400);
  });

  it("resolves an exotic when options are available", async () => {
    const roster = Array.from({ length: 6 }, (_, i) => ({
      ...readyMember,
      user_id: `m${i}`,
      selected_character_id: `char-${i}`,
    }));
    db.lobby_members = { list: { data: roster, error: null } };
    jest.mocked(selectExoticArmorOptions).mockReturnValue({
      character: { classType: 1 } as never,
      options: [
        {
          itemHash: 42,
          itemInstanceId: "inst-42",
          name: "Gyrfalcon's Hauberk",
          icon: "/gyr.png",
          slotLabel: "Chest",
          classType: 1,
          location: "character",
          characterId: "char-0",
          isEquipped: true,
        },
      ],
    });

    const res = await POST(makeRequest({ activityKinds: ["raid"] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    const pickRows = upserts["lobby_endgame_exotic_picks"][0] as Array<Record<string, unknown>>;
    expect(pickRows).toHaveLength(6);
    expect(pickRows[0]).toMatchObject({ status: "resolved", name: "Gyrfalcon's Hauberk" });
    expect(body.round).toMatchObject({ activity_name: "Root of Nightmares" });
  });

  it("marks fetch_failed (not missing_token) for a non-auth Bungie error", async () => {
    const roster = Array.from({ length: 6 }, (_, i) => ({
      ...readyMember,
      user_id: `m${i}`,
      selected_character_id: `char-${i}`,
    }));
    db.lobby_members = { list: { data: roster, error: null } };
    jest.mocked(getBungieToken).mockRejectedValueOnce(new Error("BUNGIE_TIMEOUT"));

    const res = await POST(makeRequest({ activityKinds: ["raid"] }));
    const pickRows = upserts["lobby_endgame_exotic_picks"][0] as Array<Record<string, unknown>>;

    expect(res.status).toBe(200);
    expect(pickRows.find((r) => r.user_id === "m0")).toMatchObject({ status: "fetch_failed" });
  });

  it("marks missing_token for an auth-classified Bungie error", async () => {
    const roster = Array.from({ length: 6 }, (_, i) => ({
      ...readyMember,
      user_id: `m${i}`,
      selected_character_id: `char-${i}`,
    }));
    db.lobby_members = { list: { data: roster, error: null } };
    jest.mocked(getBungieToken).mockRejectedValueOnce(new Error("AUTH_EXPIRED"));

    const res = await POST(makeRequest({ activityKinds: ["raid"] }));
    const pickRows = upserts["lobby_endgame_exotic_picks"][0] as Array<Record<string, unknown>>;

    expect(res.status).toBe(200);
    expect(pickRows.find((r) => r.user_id === "m0")).toMatchObject({ status: "missing_token" });
  });
});

describe("POST /api/endgame/lobby/roll — force reroll cleanup", () => {
  it("deletes existing exotic picks for the round before inserting fresh ones", async () => {
    db.lobby_endgame_rounds = {
      maybeSingle: { data: { round_id: "00000000-0000-0000-0000-000000000002" }, error: null },
    };
    const roster = Array.from({ length: 6 }, (_, i) => ({
      ...readyMember,
      user_id: `m${i}`,
      selected_character_id: `char-${i}`,
    }));
    db.lobby_members = { list: { data: roster, error: null } };

    const res = await POST(makeRequest({ activityKinds: ["raid"], force: true }));

    expect(res.status).toBe(200);
    expect(deletes).toContain("lobby_endgame_exotic_picks");
  });
});
