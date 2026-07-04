import { render } from "@testing-library/react";
import WeaponIcon from "@/components/WeaponIcon";

describe("WeaponIcon", () => {
  it("updates the season watermark when the selected weapon instance changes", () => {
    const { container, rerender } = render(
      <WeaponIcon
        icon="https://www.bungie.net/icon-a.jpg"
        watermark="https://www.bungie.net/watermark-a.png"
        name="First Roll"
      />
    );

    expect([...container.querySelectorAll("img")].map((img) => img.getAttribute("src"))).toContain(
      "https://www.bungie.net/watermark-a.png"
    );

    rerender(
      <WeaponIcon
        icon="https://www.bungie.net/icon-b.jpg"
        watermark="https://www.bungie.net/watermark-b.png"
        name="Second Roll"
      />
    );

    const imageSources = [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(imageSources).toContain("https://www.bungie.net/watermark-b.png");
    expect(imageSources).not.toContain("https://www.bungie.net/watermark-a.png");
  });
});
