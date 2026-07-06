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
});
