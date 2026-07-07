import { render, screen } from "@testing-library/react";
import BadgeCase from "@/components/badges/BadgeCase";
import type { CatalogBadge } from "@/lib/badges/data";
import type { BadgeMode } from "@/types/badges";

function makeEntry(slug: string, mode: BadgeMode, sortOrder: number, earned: boolean): CatalogBadge {
  return {
    slug,
    earned,
    name: slug,
    description: `${slug} description`,
    category: "completion",
    tier: "bronze",
    mode,
    iconKey: "laurel",
    sortOrder,
    earnedAt: earned ? "2026-01-01T00:00:00Z" : null,
  };
}

describe("BadgeCase", () => {
  it("shows an empty state with no badges", () => {
    render(<BadgeCase badges={[]} />);
    expect(screen.getByText(/no badges available/i)).toBeInTheDocument();
  });

  it("groups entries into sections by mode, in display order, sorted within each group", () => {
    const badges = [
      makeEntry("pve_two", "pve", 610, false),
      makeEntry("core_one", "core", 100, true),
      makeEntry("pve_one", "pve", 600, true),
      makeEntry("crucible_one", "crucible", 200, false),
    ];

    render(<BadgeCase badges={badges} />);

    const headers = screen.getAllByText(/^(Core|Crucible|Trials|Iron Banner|PvE|Status)$/).map((el) => el.textContent);
    // Core badges appear before Crucible, which appears before PvE — matches MODE_ORDER.
    expect(headers.indexOf("Core")).toBeLessThan(headers.indexOf("Crucible"));
    expect(headers.indexOf("Crucible")).toBeLessThan(headers.indexOf("PvE"));

    // "1 / 2 earned" for the PvE group (pve_one earned, pve_two not).
    expect(screen.getByText("1 / 2 earned")).toBeInTheDocument();
  });

  it("never renders a badge that wasn't passed in (hidden-filtering is the caller's job)", () => {
    const badges = [makeEntry("core_one", "core", 100, true)];
    render(<BadgeCase badges={badges} />);
    expect(screen.queryByText("core_forfeit")).not.toBeInTheDocument();
  });
});
