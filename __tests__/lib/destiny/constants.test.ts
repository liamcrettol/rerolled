import { bungieImg, damageColor, damageTheme, SLOT_ORDER } from "@/lib/destiny/constants";

describe("Destiny constants", () => {
  it("keeps the canonical slot order", () => {
    expect(SLOT_ORDER).toEqual(["kinetic", "energy", "power"]);
  });

  it("normalizes Bungie image paths without changing absolute URLs", () => {
    expect(bungieImg("/common/icon.jpg")).toBe("https://www.bungie.net/common/icon.jpg");
    expect(bungieImg("https://cdn.example/icon.jpg")).toBe("https://cdn.example/icon.jpg");
    expect(bungieImg(null)).toBe("");
  });

  it("uses one fallback for unknown damage types", () => {
    expect(damageColor("Arc")).toBe("#7bd6ff");
    expect(damageColor("Unknown")).toBe("#9aa1a9");
    expect(damageTheme("Unknown").fill).toBe("bg-bungie-blue");
  });
});
