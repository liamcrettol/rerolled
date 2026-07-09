/** @jest-environment node */
/**
 * Characterization tests for POST /api/roulette/intersection (#223).
 *
 * Pins the pool-building semantics ahead of the #224–#226 rework:
 * member-load guards, the every-member-owns-a-variant intersection rule,
 * variant pooling, exotic collection expansion, and equipped-weapon seeding.
 * Bungie profiles and definition tables are mocked with small fixtures.
 */
import { POST } from "@/app/api/roulette/intersection/route";
import { NextRequest } from "next/server";
import { bungieGet } from "@/lib/bungie/client";

const KINETIC_BUCKET = 1498876634;
const ENERGY_BUCKET = 2465295065;
const VAULT_BUCKET = 138197802;

jest.mock("@/lib/auth/helpers", () => ({
  requireSession: jest.fn().mockResolvedValue({
    userId: "user-1",
    displayName: "Caller",
    bungieMembershipType: 3,
    bungieMembershipId: "111",
  }),
  getBungieToken: jest.fn().mockResolvedValue("token"),
}));

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), flush: jest.fn() };
jest.mock("@/lib/logger", () => ({
  createLogger: jest.fn(() => mockLogger),
}));

// ── Definitions fixture ─────────────────────────────────────────────────────
// hash → def. defaultBucketHash decides the slot for vault/collection items.
const DEFS: Record<
  number,
  {
    name: string;
    weaponType: string;
    tierType: number;
    defaultBucketHash: number;
    collectibleHash?: number;
  }
> = {
  10: { name: "Shared Kinetic", weaponType: "Auto Rifle", tierType: 5, defaultBucketHash: KINETIC_BUCKET },
  11: { name: "Shared Kinetic (Adept)", weaponType: "Auto Rifle", tierType: 5, defaultBucketHash: KINETIC_BUCKET },
  20: { name: "Caller-only Energy", weaponType: "Pulse Rifle", tierType: 5, defaultBucketHash: ENERGY_BUCKET },
  30: { name: "Shared Energy", weaponType: "Sniper Rifle", tierType: 5, defaultBucketHash: ENERGY_BUCKET },
  40: { name: "Vault Kinetic", weaponType: "Hand Cannon", tierType: 5, defaultBucketHash: KINETIC_BUCKET },
  90: { name: "Exotic Energy", weaponType: "Fusion Rifle", tierType: 6, defaultBucketHash: ENERGY_BUCKET, collectibleHash: 9090 },
};

function toDef(hash: number) {
  const d = DEFS[hash];
  return {
    name: d.name,
    icon: `/icons/${hash}.png`,
    watermark: undefined,
    weaponType: d.weaponType,
    damageType: "Kinetic",
    tierType: d.tierType,
    tierName: d.tierType === 6 ? "Exotic" : "Legendary",
    ammoType: "Primary",
    stats: {},
    defaultBucketHash: d.defaultBucketHash,
    collectibleHash: d.collectibleHash,
  };
}

// Per-test variant grouping override (defaults to "every hash is its own group").
let variantGroups: Record<number, number[]> = {};

jest.mock("@/lib/bungie/definitions", () => ({
  getWeaponDefinitions: jest.fn(async (hashes: number[]) => {
    const map = new Map<number, ReturnType<typeof toDef>>();
    for (const h of hashes) if (DEFS[h]) map.set(h, toDef(h));
    return map;
  }),
  getPerkNames: jest.fn(async () => new Map<number, string>()),
  getPerkIcons: jest.fn(async () => new Map<number, string>()),
  getWeaponGroupHashes: jest.fn((h: number) => variantGroups[h] ?? [h]),
  flushDefinitionCache: jest.fn(),
}));

jest.mock("@/lib/bungie/socketRoles", () => ({
  getSocketRolePlugHash: jest.fn(() => null),
}));

// ── Supabase members fixture ────────────────────────────────────────────────
type MemberRow = {
  user_id: string;
  display_name: string;
  bungie_membership_type: number;
  bungie_membership_id: string;
  selected_character_id: string | null;
};
let membersResult: { data: MemberRow[] | null; error: { message: string } | null } = {
  data: [],
  error: null,
};

jest.mock("@/lib/supabase/admin", () => ({
  adminSupabase: {
    from: jest.fn(() => {
      // eslint-disable-next-line @jest/no-conditional-in-test, @typescript-eslint/no-explicit-any
      const chain: any = {};
      for (const m of ["select", "eq", "neq"]) chain[m] = jest.fn(() => chain);
      chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(membersResult).then(resolve, reject);
      return chain;
    }),
  },
}));

jest.mock("@/lib/bungie/client", () => ({ bungieGet: jest.fn() }));

// ── Profile builder ─────────────────────────────────────────────────────────
type EquippedItem = { hash: number; instanceId: string; bucket: number };
function makeProfile(opts: {
  characters?: Record<string, { lastPlayed: string }>;
  equipped?: Record<string, EquippedItem[]>; // charId → items
  inventory?: Record<string, EquippedItem[]>; // charId → bag items
  vault?: Array<{ hash: number; instanceId: string }>;
  collectibleStates?: Record<number, number>; // collectibleHash → state (bit 1 = NOT acquired)
}) {
  return {
    characters: {
      data: Object.fromEntries(
        Object.entries(opts.characters ?? { "char-a": { lastPlayed: "2026-01-01" } }).map(
          ([id, c]) => [id, { dateLastPlayed: c.lastPlayed }]
        )
      ),
    },
    characterEquipment: {
      data: Object.fromEntries(
        Object.entries(opts.equipped ?? {}).map(([charId, items]) => [
          charId,
          { items: items.map((i) => ({ itemHash: i.hash, itemInstanceId: i.instanceId, bucketHash: i.bucket })) },
        ])
      ),
    },
    characterInventories: {
      data: Object.fromEntries(
        Object.entries(opts.inventory ?? {}).map(([charId, items]) => [
          charId,
          { items: items.map((i) => ({ itemHash: i.hash, itemInstanceId: i.instanceId, bucketHash: i.bucket })) },
        ])
      ),
    },
    profileInventory: {
      data: {
        items: (opts.vault ?? []).map((i) => ({
          itemHash: i.hash,
          itemInstanceId: i.instanceId,
          bucketHash: VAULT_BUCKET,
        })),
      },
    },
    profileCollectibles: {
      data: {
        collectibles: Object.fromEntries(
          Object.entries(opts.collectibleStates ?? {}).map(([h, state]) => [h, { state }])
        ),
      },
    },
    itemComponents: { instances: { data: {} }, sockets: { data: {} } },
  };
}

function member(userId: string, membershipId: string, selectedCharacterId: string | null = null): MemberRow {
  return {
    user_id: userId,
    display_name: `Player ${userId}`,
    bungie_membership_type: 3,
    bungie_membership_id: membershipId,
    selected_character_id: selectedCharacterId,
  };
}

/** Route bungieGet by membership id embedded in the URL. */
function setProfiles(profiles: Record<string, unknown>) {
  jest.mocked(bungieGet).mockImplementation(async (path: string) => {
    for (const [membershipId, profile] of Object.entries(profiles)) {
      if (path.includes(`/Profile/${membershipId}/`)) return profile;
    }
    throw new Error(`no profile for ${path}`);
  });
}

function makeRequest(body: Record<string, unknown> = {}) {
  return new NextRequest("https://example.com/api/roulette/intersection", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lobbyId: "00000000-0000-0000-0000-000000000001", ...body }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  variantGroups = {};
  membersResult = { data: [], error: null };
});

describe("POST /api/roulette/intersection — member guards", () => {
  it("surfaces a members DB error as a 500, not as 'no members'", async () => {
    membersResult = { data: null, error: { message: "connection refused" } };
    const res = await POST(makeRequest());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("connection refused");
  });

  it("returns 404 when the caller isn't in the lobby", async () => {
    membersResult = { data: [], error: null };
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("not in this lobby");
  });

  it("blocks the roll with a 409 naming every member whose inventory failed to load", async () => {
    membersResult = { data: [member("user-1", "111"), member("user-2", "222")], error: null };
    setProfiles({
      "111": makeProfile({
        equipped: { "char-a": [{ hash: 10, instanceId: "i-1", bucket: KINETIC_BUCKET }] },
      }),
      // no profile for user-2 → bungieGet throws → member skipped
    });
    const res = await POST(makeRequest());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("Player user-2");
    expect(body.failedUserIds).toEqual(["user-2"]);
    expect(body.failedDisplayNames).toEqual(["Player user-2"]);
    expect(body.reauthRequired).toBe(true);
  });
});

describe("POST /api/roulette/intersection — pool semantics", () => {
  it("intersects per slot: only weapons EVERY member owns make the pool", async () => {
    membersResult = { data: [member("user-1", "111"), member("user-2", "222")], error: null };
    setProfiles({
      "111": makeProfile({
        equipped: {
          "char-a": [
            { hash: 10, instanceId: "i-1", bucket: KINETIC_BUCKET },
            { hash: 30, instanceId: "i-3", bucket: ENERGY_BUCKET },
          ],
        },
        // 20 sits unequipped in the bag: caller-only, so it must stay out of
        // the pool AND out of weaponDetails (equipped guns get details
        // backfilled even off-pool — covered in the seeding tests below).
        inventory: { "char-a": [{ hash: 20, instanceId: "i-2", bucket: ENERGY_BUCKET }] },
      }),
      "222": makeProfile({
        equipped: {
          "char-b": [
            { hash: 10, instanceId: "i-4", bucket: KINETIC_BUCKET },
            { hash: 30, instanceId: "i-5", bucket: ENERGY_BUCKET },
          ],
        },
      }),
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.intersection.kinetic).toEqual([10]);
    expect(body.intersection.energy).toEqual([30]); // 20 is caller-only → out
    expect(body.intersection.power).toEqual([]);
    expect(body.memberCount).toBe(2);
    expect(body.weaponDetails["10"].name).toBe("Shared Kinetic");
    expect(body.weaponDetails["20"]).toBeUndefined();
  });

  it("counts vault weapons toward a member's ownership", async () => {
    membersResult = { data: [member("user-1", "111"), member("user-2", "222")], error: null };
    setProfiles({
      "111": makeProfile({
        equipped: { "char-a": [{ hash: 40, instanceId: "i-1", bucket: KINETIC_BUCKET }] },
      }),
      "222": makeProfile({ vault: [{ hash: 40, instanceId: "i-2" }] }),
    });

    const body = await (await POST(makeRequest())).json();
    expect(body.intersection.kinetic).toEqual([40]);
  });

  it("pools variants: members owning DIFFERENT releases of the same gun still intersect", async () => {
    variantGroups = { 10: [10, 11], 11: [10, 11] };
    membersResult = { data: [member("user-1", "111"), member("user-2", "222")], error: null };
    setProfiles({
      "111": makeProfile({
        equipped: { "char-a": [{ hash: 10, instanceId: "i-1", bucket: KINETIC_BUCKET }] },
      }),
      "222": makeProfile({
        equipped: { "char-b": [{ hash: 11, instanceId: "i-2", bucket: KINETIC_BUCKET }] },
      }),
    });

    const body = await (await POST(makeRequest())).json();
    // One representative for the group — not both hashes.
    expect(body.intersection.kinetic).toHaveLength(1);
    expect([10, 11]).toContain(body.intersection.kinetic[0]);
  });

  it("expands exotics from collections: an unowned-but-acquired exotic joins the pool", async () => {
    membersResult = { data: [member("user-1", "111"), member("user-2", "222")], error: null };
    setProfiles({
      "111": makeProfile({
        equipped: { "char-a": [{ hash: 90, instanceId: "i-1", bucket: ENERGY_BUCKET }] },
      }),
      // user-2 doesn't OWN 90 but has acquired its collectible (state bit 1 unset)
      "222": makeProfile({
        equipped: { "char-b": [{ hash: 30, instanceId: "i-2", bucket: ENERGY_BUCKET }] },
        collectibleStates: { 9090: 0 },
      }),
    });

    const body = await (await POST(makeRequest())).json();
    expect(body.intersection.energy).toContain(90);
    expect(body.collectionHashes).toContain(90); // flagged as collection-sourced
  });

  it("does NOT expand an exotic whose collectible was never acquired", async () => {
    membersResult = { data: [member("user-1", "111"), member("user-2", "222")], error: null };
    setProfiles({
      "111": makeProfile({
        equipped: { "char-a": [{ hash: 90, instanceId: "i-1", bucket: ENERGY_BUCKET }] },
      }),
      "222": makeProfile({
        equipped: { "char-b": [{ hash: 30, instanceId: "i-2", bucket: ENERGY_BUCKET }] },
        collectibleStates: { 9090: 1 }, // bit 1 set = NOT acquired
      }),
    });

    const body = await (await POST(makeRequest())).json();
    expect(body.intersection.energy).not.toContain(90);
  });
});

describe("POST /api/roulette/intersection — solo lobby pool (#283)", () => {
  it("returns the caller's full owned pool across characters and vault, not a shrunk subset", async () => {
    membersResult = { data: [member("user-1", "111")], error: null };
    setProfiles({
      "111": makeProfile({
        characters: {
          "char-a": { lastPlayed: "2026-01-01" },
          "char-b": { lastPlayed: "2026-06-01" },
        },
        equipped: {
          "char-a": [{ hash: 10, instanceId: "i-1", bucket: KINETIC_BUCKET }],
          "char-b": [{ hash: 30, instanceId: "i-2", bucket: ENERGY_BUCKET }],
        },
        inventory: {
          "char-a": [{ hash: 20, instanceId: "i-3", bucket: ENERGY_BUCKET }],
        },
        vault: [{ hash: 40, instanceId: "i-4" }],
      }),
    });

    const body = await (await POST(makeRequest())).json();
    // Solo pool = everything the one member owns: equipped on both
    // characters, bagged, and vaulted - nothing should be filtered out
    // just because there's no one else to intersect against.
    expect(body.intersection.kinetic).toEqual([10, 40]);
    expect(body.intersection.energy).toEqual(expect.arrayContaining([20, 30]));
    expect(body.intersection.energy).toHaveLength(2);
    expect(body.memberCount).toBe(1);
  });

  it("logs pool-build diagnostics with raw vs. final counts and vault-unresolved hashes", async () => {
    membersResult = { data: [member("user-1", "111")], error: null };
    setProfiles({
      "111": makeProfile({
        equipped: { "char-a": [{ hash: 10, instanceId: "i-1", bucket: KINETIC_BUCKET }] },
        // 999 isn't in the DEFS fixture - simulates a vault item missing from
        // the static weapons table (stale manifest sync), which gets dropped
        // from the pool silently. The diagnostics log should surface it.
        vault: [{ hash: 999, instanceId: "i-2" }],
      }),
    });

    await POST(makeRequest());

    expect(mockLogger.info).toHaveBeenCalledWith(
      "intersection.pool_built",
      expect.objectContaining({
        memberCount: 1,
        vaultUnresolvedCount: 1,
        vaultUnresolvedSample: [999],
      })
    );
  });
});

describe("POST /api/roulette/intersection — equipped-weapon seeding", () => {
  const twoCharProfile = () =>
    makeProfile({
      characters: {
        "char-old": { lastPlayed: "2026-01-01" },
        "char-new": { lastPlayed: "2026-06-01" },
      },
      equipped: {
        "char-old": [{ hash: 10, instanceId: "i-1", bucket: KINETIC_BUCKET }],
        "char-new": [{ hash: 40, instanceId: "i-2", bucket: KINETIC_BUCKET }],
      },
    });

  it("prefers the explicitly requested characterId for the caller's equipped hashes", async () => {
    membersResult = { data: [member("user-1", "111")], error: null };
    setProfiles({ "111": twoCharProfile() });

    const body = await (
      await POST(makeRequest({ characterId: "char-old" }))
    ).json();
    expect(body.equippedHashes.kinetic).toBe(10);
  });

  it("falls back to the most-recently-played character when none is requested", async () => {
    membersResult = { data: [member("user-1", "111")], error: null };
    setProfiles({ "111": twoCharProfile() });

    const body = await (await POST(makeRequest())).json();
    expect(body.equippedHashes.kinetic).toBe(40); // char-new played latest
  });

  it("reports every member's equipped loadout, honoring their selected character", async () => {
    membersResult = {
      data: [member("user-1", "111"), member("user-2", "222", "char-old")],
      error: null,
    };
    setProfiles({ "111": twoCharProfile(), "222": twoCharProfile() });

    const body = await (await POST(makeRequest())).json();
    expect(body.memberEquipped["user-2"].kinetic).toBe(10); // selected char-old
    expect(body.memberEquipped["user-1"].kinetic).toBe(40); // fallback: most recent
  });

  it("includes weaponDetails for equipped guns even when they're outside the shared pool", async () => {
    membersResult = { data: [member("user-1", "111"), member("user-2", "222")], error: null };
    setProfiles({
      "111": makeProfile({
        equipped: {
          "char-a": [
            { hash: 10, instanceId: "i-1", bucket: KINETIC_BUCKET },
            { hash: 20, instanceId: "i-2", bucket: ENERGY_BUCKET }, // caller-only, not in pool
          ],
        },
      }),
      "222": makeProfile({
        equipped: { "char-b": [{ hash: 10, instanceId: "i-3", bucket: KINETIC_BUCKET }] },
      }),
    });

    const body = await (await POST(makeRequest())).json();
    expect(body.intersection.energy).toEqual([]);
    expect(body.weaponDetails["20"].name).toBe("Caller-only Energy"); // still renderable
  });
});
