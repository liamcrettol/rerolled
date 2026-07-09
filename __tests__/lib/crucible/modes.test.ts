import { classifyCrucibleMode } from "@/lib/crucible/modes";

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

