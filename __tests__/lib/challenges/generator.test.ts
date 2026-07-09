import { generateWeeklyChallengeDraft, slugifyWeeklyChallenge } from "@/lib/challenges/generator";
import { bannedWeaponTypeRule, requiredWeaponTypeRule } from "@/lib/challenges/rules";

describe("generateWeeklyChallengeDraft", () => {
  it("is deterministic for the same seed and inputs", () => {
    const a = generateWeeklyChallengeDraft({ seasonKey: "season-0", weekNumber: 42 });
    const b = generateWeeklyChallengeDraft({ seasonKey: "season-0", weekNumber: 42 });
    expect(a).toEqual(b);
  });

  it("produces different drafts for different weeks", () => {
    const week42 = generateWeeklyChallengeDraft({ seasonKey: "season-0", weekNumber: 42 });
    const week43 = generateWeeklyChallengeDraft({ seasonKey: "season-0", weekNumber: 43 });
    expect(week42.seed).not.toEqual(week43.seed);
  });

  it("produces different drafts for different seasons at the same week number", () => {
    const seasonA = generateWeeklyChallengeDraft({ seasonKey: "season-0", weekNumber: 1 });
    const seasonB = generateWeeklyChallengeDraft({ seasonKey: "season-1", weekNumber: 1 });
    expect(seasonA.seed).not.toEqual(seasonB.seed);
  });

  it("respects an explicit seed override for reproducing a specific draft", () => {
    const a = generateWeeklyChallengeDraft({ seasonKey: "season-0", weekNumber: 1, seed: "fixed-seed" });
    const b = generateWeeklyChallengeDraft({ seasonKey: "season-9", weekNumber: 99, seed: "fixed-seed" });
    expect(a.activityHash).toEqual(b.activityHash);
    expect(a.rules).toEqual(b.rules);
  });

  it("honors forced activity and forced rules, bypassing the seeded pool", () => {
    const forcedActivity = { activityHash: 999, name: "Forced Raid", mode: 4, family: "raid" as const };
    const forcedRules = [requiredWeaponTypeRule("Glaive")];

    const draft = generateWeeklyChallengeDraft({
      seasonKey: "season-0",
      weekNumber: 1,
      forcedActivity,
      forcedRules,
    });

    expect(draft.activityHash).toBe(999);
    expect(draft.activityNameSnapshot).toBe("Forced Raid");
    expect(draft.rules).toEqual(forcedRules);
  });

  it("surfaces validation warnings for an inconsistent forced rule set instead of throwing", () => {
    const draft = generateWeeklyChallengeDraft({
      seasonKey: "season-0",
      weekNumber: 1,
      forcedRules: [requiredWeaponTypeRule("Sidearm"), bannedWeaponTypeRule("Sidearm")],
    });

    expect(draft.validationWarnings.length).toBeGreaterThan(0);
  });

  it("slugifies season key + week number into a URL-safe, unique-ish slug", () => {
    expect(slugifyWeeklyChallenge("2026-summer", 7)).toBe("2026-summer-week-7");
  });

  it("picks from the real manifest-backed catalog, not the old fake placeholder hashes (#273)", () => {
    const draft = generateWeeklyChallengeDraft({ seasonKey: "season-0", weekNumber: 42 });

    expect([1, 2, 3]).not.toContain(draft.activityHash);
    expect(draft.activityHash).toBeGreaterThan(1000);
    expect(["raid", "dungeon", "gm"]).toContain(draft.activityFamily);
  });

  it("defaults pillar to pve", () => {
    const draft = generateWeeklyChallengeDraft({ seasonKey: "season-0", weekNumber: 1 });
    expect(draft.pillar).toBe("pve");
  });
});

describe("generateWeeklyChallengeDraft — PvP pillar (#296)", () => {
  it("picks only from the curated always-available Control/Clash allowlist, never Private Match or event playlists", () => {
    for (let week = 1; week <= 30; week++) {
      const draft = generateWeeklyChallengeDraft({ seasonKey: "season-0", weekNumber: week, pillar: "pvp" });
      expect(["Control", "Clash"]).toContain(draft.activityNameSnapshot);
      expect(draft.activityFamily).toBe("crucible");
      expect(draft.pillar).toBe("pvp");
    }
  });

  it("suffixes the slug with -pvp so it never collides with the PvE slug for the same week", () => {
    const pve = generateWeeklyChallengeDraft({ seasonKey: "season-0", weekNumber: 5 });
    const pvp = generateWeeklyChallengeDraft({ seasonKey: "season-0", weekNumber: 5, pillar: "pvp" });

    expect(pve.slug).toBe("season-0-week-5");
    expect(pvp.slug).toBe("season-0-week-5-pvp");
    expect(pvp.slug).not.toBe(pve.slug);
  });

  it("produces distinct slugs for every week, so repeat generation never collides", () => {
    const slugs = new Set<string>();
    for (let week = 1; week <= 20; week++) {
      slugs.add(generateWeeklyChallengeDraft({ seasonKey: "season-0", weekNumber: week, pillar: "pvp" }).slug);
    }
    expect(slugs.size).toBe(20);
  });

  it("uses match-completion copy instead of the PvE 'complete the activity' copy", () => {
    const draft = generateWeeklyChallengeDraft({ seasonKey: "season-0", weekNumber: 1, pillar: "pvp" });
    const completionRule = draft.rules.find((r) => r.key === "activity_completion_required");
    expect(completionRule?.display).toMatch(/match/i);
    expect(completionRule?.display).not.toMatch(/activity must be completed/i);
  });

  it("stores a null activity_mode (no guessed Bungie mode-type constants)", () => {
    const draft = generateWeeklyChallengeDraft({ seasonKey: "season-0", weekNumber: 1, pillar: "pvp" });
    expect(draft.activityMode).toBeNull();
  });
});
