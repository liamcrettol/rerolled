import { classifyCrucibleMode, crucibleModeName } from "@/lib/crucible/modes";

const classify = (activityMode: number | null, activityModes: number[] = []) =>
  classifyCrucibleMode({ activityMode, activityModes, activityHash: null });

describe("classifyCrucibleMode", () => {
  it("gives Trials priority over overlapping modes", () => {
    expect(classify(10, [5, 10, 84])).toBe("trials");
  });

  it("recognizes Iron Banner variants", () => {
    expect(classify(43, [5, 10, 19, 43])).toBe("iron_banner");
  });

  it.each([37, 38, 59, 69, 74, 80, 88, 93])("recognizes competitive mode %i", (mode) => {
    expect(classify(mode, [5, mode])).toBe("competitive");
  });

  it("recognizes Control", () => {
    expect(classify(10, [5, 10])).toBe("control");
  });

  it("keeps unknown PvP modes in Other", () => {
    expect(classify(null, [5, 999])).toBe("other");
  });
});

describe("crucibleModeName", () => {
  it("shows the Competitive playlist and Zone Control ruleset", () => {
    expect(crucibleModeName({ activityMode: 89, activityModes: [5, 89] })).toBe("Competitive Zone Control");
  });

  it("shows the Competitive playlist and Clash ruleset", () => {
    expect(crucibleModeName({ activityMode: 72, activityModes: [5, 69, 72] })).toBe("Competitive Clash");
  });

  it("uses the stored competitive bucket for older Clash rows", () => {
    expect(crucibleModeName({ activityMode: 71, activityModes: [5, 12, 71], modeBucket: "competitive" })).toBe("Competitive Clash");
  });

  it("keeps quickplay Clash concise", () => {
    expect(crucibleModeName({ activityMode: 71, activityModes: [5, 70, 12, 71] })).toBe("Clash");
  });
});
