// Weekly-challenge rule enforcement at roll time (#252).
//
// The published ruleset was previously display-only chips — a weekly roll
// pulled from the player's whole inventory, so a "Sidearm required / No
// exotics" week could be cleared with anything. This applies the roll-shaping
// rules to the slot pools *before* rollLoadout runs, so a weekly loadout
// satisfies its rules by construction:
//
//   banned_weapon_type / banned_damage_type → hard-filtered from every pool
//   allow_exotics: false                    → exotics hard-filtered
//   required_exotic_slot                    → that slot's pool restricted to exotics
//   required_weapon_type / required_damage_type
//     → one candidate slot (seeded pick) is restricted to matching weapons,
//       guaranteeing "at least one rolled weapon matches"
//   wildcard_slots → reported to the caller; those slots aren't rolled at all
//
// Post-roll rules (usage %, completion, fresh, flawless) are scoring/compliance
// concerns and are not handled here.
//
// Bans are HARD filters on purpose: if a player's inventory can't satisfy the
// week's rules, the roll must fail loudly (`unsatisfiable`) rather than hand
// out a rule-breaking loadout that scores onto the global board.

import type { WeaponSlot } from "@/types/bungie";
import type { WeeklyChallengeRuleSet } from "@/types/challenges";

export interface RollRuleWeaponDetail {
  weaponType: string;
  damageType?: string;
  tierType?: number;
}

export interface ApplyRollRulesInput {
  pools: Record<WeaponSlot, number[]>;
  details: Record<string, RollRuleWeaponDetail>;
  rules: WeeklyChallengeRuleSet | null | undefined;
  /** Seeded RNG for the required-slot choice, so it's stable per run. */
  rng?: () => number;
}

export interface ApplyRollRulesResult {
  pools: Record<WeaponSlot, number[]>;
  /** Slots the ruleset designates as "bring your own weapon" — not rolled. */
  wildcardSlots: WeaponSlot[];
  /**
   * Rules the player's inventory cannot satisfy. Non-empty means the roll must
   * be refused, not degraded.
   */
  unsatisfiable: string[];
}

const SLOTS: WeaponSlot[] = ["kinetic", "energy", "power"];

function ruleValue(rules: WeeklyChallengeRuleSet, key: string): unknown {
  return rules.find((r) => r.key === key)?.value;
}

export function applyRollRules(input: ApplyRollRulesInput): ApplyRollRulesResult {
  const rules = input.rules ?? [];
  const rng = input.rng ?? Math.random;
  const detail = (h: number) => input.details[h.toString()];
  const pools: Record<WeaponSlot, number[]> = {
    kinetic: [...input.pools.kinetic],
    energy: [...input.pools.energy],
    power: [...input.pools.power],
  };
  const unsatisfiable: string[] = [];

  // ── wildcard slots: excluded from rolling entirely ─────────────────────────
  const wildcardValue = ruleValue(rules, "wildcard_slots");
  const wildcardSlots = (Array.isArray(wildcardValue) ? wildcardValue : []).filter(
    (s): s is WeaponSlot => SLOTS.includes(s as WeaponSlot)
  );

  const rolledSlots = SLOTS.filter((s) => !wildcardSlots.includes(s));

  // ── hard bans across every pool ─────────────────────────────────────────────
  const bannedWeaponType = ruleValue(rules, "banned_weapon_type");
  const bannedDamageType = ruleValue(rules, "banned_damage_type");
  const allowExotics = ruleValue(rules, "allow_exotics");

  for (const slot of rolledSlots) {
    let pool = pools[slot];
    if (typeof bannedWeaponType === "string") {
      pool = pool.filter((h) => detail(h)?.weaponType !== bannedWeaponType);
    }
    if (typeof bannedDamageType === "string") {
      pool = pool.filter((h) => detail(h)?.damageType !== bannedDamageType);
    }
    if (allowExotics === false) {
      pool = pool.filter((h) => (detail(h)?.tierType ?? 5) !== 6);
    }
    pools[slot] = pool;
    if (pool.length === 0) {
      unsatisfiable.push(`Your ${slot} weapons can't satisfy this week's bans.`);
    }
  }

  // ── required exotic slot ────────────────────────────────────────────────────
  const requiredExoticSlot = ruleValue(rules, "required_exotic_slot");
  if (
    typeof requiredExoticSlot === "string" &&
    SLOTS.includes(requiredExoticSlot as WeaponSlot) &&
    !wildcardSlots.includes(requiredExoticSlot as WeaponSlot)
  ) {
    const slot = requiredExoticSlot as WeaponSlot;
    const exotics = pools[slot].filter((h) => (detail(h)?.tierType ?? 5) === 6);
    if (exotics.length === 0) {
      unsatisfiable.push(`This week requires an exotic ${slot} weapon and you don't own one that fits the rules.`);
    } else {
      pools[slot] = exotics;
    }
  }

  // ── required weapon/damage type: pin one candidate slot to matches ─────────
  const pinSlotTo = (
    key: "required_weapon_type" | "required_damage_type",
    matches: (h: number) => boolean,
    describe: string
  ) => {
    const candidates = rolledSlots.filter((slot) => pools[slot].some(matches));
    if (candidates.length === 0) {
      unsatisfiable.push(`This week requires ${describe} and none of your weapons qualify.`);
      return;
    }
    const slot = candidates[Math.floor(rng() * candidates.length)];
    pools[slot] = pools[slot].filter(matches);
  };

  const requiredWeaponType = ruleValue(rules, "required_weapon_type");
  if (typeof requiredWeaponType === "string") {
    pinSlotTo(
      "required_weapon_type",
      (h) => detail(h)?.weaponType === requiredWeaponType,
      `a ${requiredWeaponType}`
    );
  }

  const requiredDamageType = ruleValue(rules, "required_damage_type");
  if (typeof requiredDamageType === "string") {
    pinSlotTo(
      "required_damage_type",
      (h) => detail(h)?.damageType === requiredDamageType,
      `a ${requiredDamageType} weapon`
    );
  }

  return { pools, wildcardSlots, unsatisfiable };
}
