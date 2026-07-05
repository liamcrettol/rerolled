import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import WeaponPool from "@/components/WeaponPool";
import type { WeaponSlot } from "@/types/bungie";
import type { WeaponDetail } from "@/components/weaponShared";

const detail = (name: string, tierType: number): WeaponDetail => ({
  name,
  icon: `https://www.bungie.net/${name}.jpg`,
  weaponType: "Hand Cannon",
  damageType: "Kinetic",
  tierType,
  tierName: tierType === 6 ? "Exotic" : "Legendary",
  ammoType: "Primary",
  stats: { RPM: 140 },
});

const baseIntersection: Record<WeaponSlot, number[]> = {
  kinetic: [100, 200, 300],
  energy: [],
  power: [],
};

const baseDetails: Record<string, WeaponDetail> = {
  "100": detail("Exotic Collection", 6),
  "200": detail("Legendary Shared", 5),
  "300": detail("Favorite Pick", 5),
};

function renderPool(overrides: Partial<ComponentProps<typeof WeaponPool>> = {}) {
  return render(
    <WeaponPool
      intersection={baseIntersection}
      weaponDetails={baseDetails}
      instancePerks={{}}
      collectionHashes={new Set([100])}
      currentHashes={{}}
      currentInstances={{}}
      onSelectWeapon={jest.fn()}
      favorites={{ "300": "favorite-instance" }}
      {...overrides}
    />
  );
}

describe("WeaponPool", () => {
  it("puts favorited weapons first in the default browser order", () => {
    renderPool();

    const favorite = screen.getByText("Favorite Pick");
    const collection = screen.getByText("Exotic Collection");

    expect(favorite.compareDocumentPosition(collection)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("can hide collection weapons from the browser", () => {
    renderPool();

    expect(screen.getByText("Exotic Collection")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide Collections" }));

    expect(screen.queryByText("Exotic Collection")).not.toBeInTheDocument();
    expect(screen.getByText("Legendary Shared")).toBeInTheDocument();
    expect(screen.getByText("Favorite Pick")).toBeInTheDocument();
  });

  it("shows a useful empty state and clears filters", () => {
    renderPool();

    fireEvent.change(screen.getByPlaceholderText("Search kinetic…"), {
      target: { value: "not a real gun" },
    });

    expect(screen.getByText("No weapons match these filters")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear Filters" }));

    expect(screen.getByText("Favorite Pick")).toBeInTheDocument();
    expect(screen.queryByText("No weapons match these filters")).not.toBeInTheDocument();
  });
});
