/** @jest-environment node */
import { nextWeeklyReset } from "@/lib/challenges/rotate";

// Destiny weekly reset: Tuesday 17:00 UTC.
describe("nextWeeklyReset", () => {
  it("rolls forward to Tuesday 17:00 from mid-week", () => {
    // Friday 2026-07-03 12:00 UTC → Tuesday 2026-07-07 17:00 UTC
    const next = nextWeeklyReset(new Date("2026-07-03T12:00:00Z"));
    expect(next.toISOString()).toBe("2026-07-07T17:00:00.000Z");
  });

  it("uses the same day when it's Tuesday before reset", () => {
    const next = nextWeeklyReset(new Date("2026-07-07T10:00:00Z"));
    expect(next.toISOString()).toBe("2026-07-07T17:00:00.000Z");
  });

  it("skips a full week when it's Tuesday at/after reset", () => {
    expect(nextWeeklyReset(new Date("2026-07-07T17:00:00Z")).toISOString()).toBe(
      "2026-07-14T17:00:00.000Z"
    );
    expect(nextWeeklyReset(new Date("2026-07-07T18:30:00Z")).toISOString()).toBe(
      "2026-07-14T17:00:00.000Z"
    );
  });

  it("always returns a strictly future instant", () => {
    for (let d = 0; d < 7; d++) {
      const now = new Date(Date.UTC(2026, 6, 1 + d, 17, 0, 0));
      expect(nextWeeklyReset(now).getTime()).toBeGreaterThan(now.getTime());
    }
  });
});
