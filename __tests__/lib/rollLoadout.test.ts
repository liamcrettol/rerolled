/**
 * Characterization tests for rollLoadout (#223).
 *
 * These pin CURRENT behavior of the roll engine ahead of the LobbyRoom/roll
 * pipeline rework (#224–#226). If one of these fails after a refactor, the
 * refactor changed observable behavior — decide deliberately whether that
 * change is intended before updating the test.
 *
 * RNG-dependent picks are characterized two ways:
 *  - `withRandom(0)` pins Math.random to 0 so `pick()` deterministically takes
 *    the FIRST element of whatever pool survived filtering — exposing the
 *    pool's composition through its first element.
 *  - `collectPicks()` runs many rolls with real RNG and asserts the SET of
 *    outcomes, exposing the full pool composition.
 */
import { rollLoadout } from "@/lib/roulette/intersection";
import type { WeaponSlot } from "@/types/bungie";

type Details = Parameters<typeof rollLoadout>[1];
type Intersection = Record<WeaponSlot, number[]>;

// ── Fixture weapons ─────────────────────────────────────────────────────────
// Hash ranges: 1xx primaries, 2xx specials, 3xx exotics, 4xx power.
const DETAILS: Details = {
  // Primaries (legendary, tierType 5, Primary ammo)
  "100": { weaponType: "Submachine Gun", tierType: 5, ammoType: "Primary" },
  "101": { weaponType: "Sidearm", tierType: 5, ammoType: "Primary" },
  "102": { weaponType: "Pulse Rifle", tierType: 5, ammoType: "Primary" },
  "103": { weaponType: "Scout Rifle", tierType: 5, ammoType: "Primary" },
  "104": { weaponType: "Auto Rifle", tierType: 5, ammoType: "Primary" },
  "105": { weaponType: "Hand Cannon", tierType: 5, ammoType: "Primary" },
  "106": { weaponType: "Combat Bow", tierType: 5, ammoType: "Primary" },
  // Specials (legendary)
  "200": { weaponType: "Sniper Rifle", tierType: 5, ammoType: "Special" },
  "201": { weaponType: "Shotgun", tierType: 5, ammoType: "Special" },
  "202": { weaponType: "Fusion Rifle", tierType: 5, ammoType: "Special" },
  // Exotics (tierType 6)
  "300": { weaponType: "Hand Cannon", tierType: 6, ammoType: "Primary" },
  "301": { weaponType: "Sniper Rifle", tierType: 6, ammoType: "Special" },
  "302": { weaponType: "Auto Rifle", tierType: 6, ammoType: "Primary" },
  // Power
  "400": { weaponType: "Rocket Launcher", tierType: 5, ammoType: "Heavy" },
  "401": { weaponType: "Sword", tierType: 6, ammoType: "Heavy" },
  "402": { weaponType: "Machine Gun", tierType: 5, ammoType: "Heavy" },
  // Meta-frame weapons (RPM-tagged) + off-meta siblings
  "500": { weaponType: "Hand Cannon", tierType: 5, ammoType: "Primary", stats: { RPM: 140 } },
  "501": { weaponType: "Hand Cannon", tierType: 5, ammoType: "Primary", stats: { RPM: 180 } },
  "502": { weaponType: "Sniper Rifle", tierType: 5, ammoType: "Special", stats: { RPM: 90 } },
  "503": { weaponType: "Sniper Rifle", tierType: 5, ammoType: "Special", stats: { RPM: 140 } },
  "504": { weaponType: "Shotgun", tierType: 5, ammoType: "Special", stats: { RPM: 65 } },
};

function pools(p: Partial<Intersection>): Intersection {
  return { kinetic: [], energy: [], power: [], ...p };
}

function withRandom<T>(value: number, fn: () => T): T {
  const spy = jest.spyOn(Math, "random").mockReturnValue(value);
  try {
    return fn();
  } finally {
    spy.mockRestore();
  }
}

/** Run the roll N times with real RNG and collect the distinct picks per slot. */
function collectPicks(
  intersection: Intersection,
  exclude?: Parameters<typeof rollLoadout>[2],
  avoid?: Parameters<typeof rollLoadout>[3],
  mode?: Parameters<typeof rollLoadout>[4],
  n = 200
): Record<WeaponSlot, Set<number | null>> {
  const seen: Record<WeaponSlot, Set<number | null>> = {
    kinetic: new Set(),
    energy: new Set(),
    power: new Set(),
  };
  for (let i = 0; i < n; i++) {
    const roll = rollLoadout(intersection, DETAILS, exclude, avoid, mode);
    seen.kinetic.add(roll.kinetic);
    seen.energy.add(roll.energy);
    seen.power.add(roll.power);
  }
  return seen;
}

describe("rollLoadout — basics", () => {
  it("returns null for every slot when all pools are empty", () => {
    const roll = rollLoadout(pools({}), DETAILS);
    expect(roll).toEqual({ kinetic: null, energy: null, power: null });
  });

  it("rolls the only available weapon in each slot", () => {
    const roll = rollLoadout(
      pools({ kinetic: [100], energy: [200], power: [400] }),
      DETAILS
    );
    expect(roll).toEqual({ kinetic: 100, energy: 200, power: 400 });
  });

  it("keeps explicitly locked slots verbatim (even hashes not in the pool)", () => {
    const roll = rollLoadout(
      pools({ kinetic: [100], energy: [200], power: [400] }),
      DETAILS,
      { kinetic: 105, power: 402 }
    );
    expect(roll.kinetic).toBe(105);
    expect(roll.power).toBe(402);
  });

  it("treats the wildcard sentinel 0 as NOT kept — the slot still rolls", () => {
    const roll = rollLoadout(
      pools({ kinetic: [100], energy: [200], power: [400] }),
      DETAILS,
      { kinetic: 0, power: 0 }
    );
    expect(roll.kinetic).toBe(100);
    expect(roll.power).toBe(400);
  });
});

describe("rollLoadout — archetype pairing (kinetic ↔ energy)", () => {
  it("pairs a locked SMG kinetic with a Sniper energy, never the Shotgun", () => {
    const seen = collectPicks(
      pools({ kinetic: [100], energy: [200, 201, 202] }),
      { kinetic: 100 }
    );
    expect(seen.energy).toEqual(new Set([200]));
  });

  it("pairs a locked Shotgun energy with a long/mid-range primary, never SMG/Sidearm", () => {
    const seen = collectPicks(
      pools({ kinetic: [100, 101, 102, 103, 104, 105], energy: [201] }),
      { energy: 201 }
    );
    // Shotgun pulls Pulse/Scout/Bow/Auto/HC — SMG(100)/Sidearm(101) excluded.
    expect(seen.kinetic).toEqual(new Set([102, 103, 104, 105]));
  });

  it("lets Hand Cannon pair with either special", () => {
    const seen = collectPicks(pools({ kinetic: [105], energy: [200, 201] }), {
      kinetic: 105,
    });
    expect(seen.energy).toEqual(new Set([200, 201]));
  });

  it("falls back to the full pool when no complementary type exists (never empties a slot)", () => {
    // SMG wants a Sniper; only a Fusion exists → full pool fallback.
    const roll = rollLoadout(pools({ kinetic: [100], energy: [202] }), DETAILS, {
      kinetic: 100,
    });
    expect(roll.energy).toBe(202);
  });

  it("applies pairing to the kinetic roll when energy was rolled first via lock", () => {
    // Locked energy sniper (200) → kinetic pool restricted to SMG/Sidearm/Auto/HC.
    const seen = collectPicks(
      pools({ kinetic: [100, 101, 102, 103, 104, 105, 106], energy: [200] }),
      { energy: 200 }
    );
    expect(seen.kinetic).toEqual(new Set([100, 101, 104, 105]));
  });

  it("chaos mode skips pairing entirely", () => {
    const seen = collectPicks(
      pools({ kinetic: [100], energy: [200, 201, 202] }),
      { kinetic: 100 },
      undefined,
      "chaos"
    );
    expect(seen.energy).toEqual(new Set([200, 201, 202]));
  });
});

describe("rollLoadout — double-special prevention", () => {
  it("never rolls two Special-ammo weapons across kinetic+energy", () => {
    for (let i = 0; i < 200; i++) {
      const roll = rollLoadout(
        pools({ kinetic: [100, 200], energy: [201, 102], power: [400] }),
        DETAILS,
        undefined,
        undefined,
        "chaos" // chaos so pairing doesn't mask the special check
      );
      const kSpecial = DETAILS[String(roll.kinetic)]?.ammoType === "Special";
      const eSpecial = DETAILS[String(roll.energy)]?.ammoType === "Special";
      expect(kSpecial && eSpecial).toBe(false);
    }
  });

  it("still applies the special check in chaos mode when a special is locked", () => {
    const seen = collectPicks(
      pools({ kinetic: [100, 200], energy: [201] }),
      { energy: 201 },
      undefined,
      "chaos"
    );
    expect(seen.kinetic).toEqual(new Set([100]));
  });

  it("falls back to specials when the pool has nothing else", () => {
    const roll = rollLoadout(pools({ kinetic: [200], energy: [201] }), DETAILS, {
      energy: 201,
    });
    expect(roll.kinetic).toBe(200); // two specials allowed rather than an empty slot
  });
});

describe("rollLoadout — exotic rules", () => {
  it("never rolls exotic power (filters tierType 6 from the power pool)", () => {
    const seen = collectPicks(pools({ power: [400, 401, 402] }));
    expect(seen.power).toEqual(new Set([400, 402]));
  });

  it("falls back to exotic power only when the pool is ALL exotics", () => {
    const roll = rollLoadout(pools({ power: [401] }), DETAILS);
    expect(roll.power).toBe(401);
  });

  it("a kept exotic (any slot) forces every rolled slot non-exotic", () => {
    const seen = collectPicks(
      pools({ kinetic: [105, 300], energy: [200, 301] }),
      { power: 401 } // exotic sword locked in power
    );
    expect(seen.kinetic).toEqual(new Set([105]));
    expect(seen.energy).not.toContain(301);
  });

  it("hashes missing from weaponDetails count as exotic-safe (default tierType 5)", () => {
    const roll = rollLoadout(pools({ kinetic: [9999] }), DETAILS);
    expect(roll.kinetic).toBe(9999);
  });

  it("post-roll fixup: never returns two exotics even when a slot pool is all-exotic", () => {
    for (let i = 0; i < 100; i++) {
      const roll = rollLoadout(
        pools({ kinetic: [300, 105], energy: [301] }), // energy pool is ONLY an exotic
        DETAILS,
        undefined,
        undefined,
        "chaos"
      );
      const exotics = [roll.kinetic, roll.energy].filter(
        (h) => h != null && DETAILS[String(h)]?.tierType === 6
      );
      expect(exotics.length).toBeLessThanOrEqual(1);
    }
  });
});

describe("rollLoadout — avoid window (recent-roll memory)", () => {
  it("excludes recently rolled weapons when the pool allows", () => {
    const seen = collectPicks(pools({ kinetic: [100, 104, 105] }), undefined, {
      kinetic: [100],
    });
    expect(seen.kinetic).toEqual(new Set([104, 105]));
  });

  it("relaxes from the oldest end: keeps at least one candidate", () => {
    // Avoiding both would empty the pool → only the most recent (100) is avoided.
    const seen = collectPicks(pools({ kinetic: [100, 104] }), undefined, {
      kinetic: [100, 104],
    });
    expect(seen.kinetic).toEqual(new Set([104]));
  });

  it("ignores the avoid list entirely when the pool is a single weapon", () => {
    const roll = rollLoadout(pools({ kinetic: [100] }), DETAILS, undefined, {
      kinetic: [100],
    });
    expect(roll.kinetic).toBe(100);
  });

  it("applies the avoid window to power too", () => {
    const seen = collectPicks(pools({ power: [400, 402] }), undefined, {
      power: [400],
    });
    expect(seen.power).toEqual(new Set([402]));
  });
});

describe("rollLoadout — meta mode", () => {
  it("restricts slots to meta RPM frames (HC 120/140, Shotgun 55/65, Sniper 72/90)", () => {
    const seen = collectPicks(
      pools({ kinetic: [500, 501], energy: [502, 503, 504] }),
      undefined,
      undefined,
      "meta"
    );
    expect(seen.kinetic).toEqual(new Set([500])); // 140 HC only; 180 filtered
    expect(seen.energy).not.toContain(503); // 140 sniper is off-meta
  });

  it("falls back to the full pool when a slot has no meta weapons", () => {
    const roll = rollLoadout(
      pools({ kinetic: [104] }), // Auto Rifle, no RPM stat
      DETAILS,
      undefined,
      undefined,
      "meta"
    );
    expect(roll.kinetic).toBe(104);
  });

  it("applies the meta filter to the power pool as well", () => {
    // Neither power weapon is a meta frame → filter is empty → full-pool fallback.
    const seen = collectPicks(pools({ power: [400, 402] }), undefined, undefined, "meta");
    expect(seen.power).toEqual(new Set([400, 402]));
  });
});

describe("rollLoadout — deterministic pick order (Math.random pinned to 0)", () => {
  it("picks the first surviving pool element", () => {
    const roll = withRandom(0, () =>
      rollLoadout(pools({ kinetic: [104, 105], energy: [200, 201], power: [400, 402] }), DETAILS)
    );
    expect(roll.kinetic).toBe(104);
    // kinetic=Auto Rifle pairs with Sniper|Shotgun → energy pool unchanged → first = 200
    expect(roll.energy).toBe(200);
    expect(roll.power).toBe(400);
  });
});
