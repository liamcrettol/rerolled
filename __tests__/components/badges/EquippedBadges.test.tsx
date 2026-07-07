import { render, screen } from "@testing-library/react";
import EquippedBadges from "@/components/badges/EquippedBadges";
import type { DisplayBadge } from "@/lib/badges/data";
import type { BadgeTier } from "@/types/badges";

function makeBadge(slug: string, tier: BadgeTier, earnedAt: string): DisplayBadge {
  return {
    slug,
    status: "earned",
    name: slug,
    description: `${slug} description`,
    category: "completion",
    tier,
    mode: "core",
    iconKey: "laurel",
    earnedAt,
    sortOrder: 100,
    evidence: { sourceRunId: null, sourceWeeklyChallengeId: null, seasonId: null },
  };
}

describe("EquippedBadges", () => {
  it("renders nothing when there are no badges", () => {
    const { container } = render(<EquippedBadges badges={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows at most 3 badges with an overflow count, rarest tier first", () => {
    const badges = [
      makeBadge("bronze1", "bronze", "2026-01-01T00:00:00Z"),
      makeBadge("gold1", "gold", "2026-01-02T00:00:00Z"),
      makeBadge("platinum1", "platinum", "2026-01-03T00:00:00Z"),
      makeBadge("silver1", "silver", "2026-01-04T00:00:00Z"),
      makeBadge("special1", "special", "2026-01-05T00:00:00Z"),
    ];

    render(<EquippedBadges badges={badges} />);

    expect(screen.getByText("special1")).toBeInTheDocument();
    expect(screen.getByText("platinum1")).toBeInTheDocument();
    expect(screen.getByText("gold1")).toBeInTheDocument();
    expect(screen.queryByText("silver1")).not.toBeInTheDocument();
    expect(screen.queryByText("bronze1")).not.toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("respects a custom max", () => {
    const badges = [
      makeBadge("a", "bronze", "2026-01-01T00:00:00Z"),
      makeBadge("b", "bronze", "2026-01-02T00:00:00Z"),
    ];
    render(<EquippedBadges badges={badges} max={1} />);
    expect(screen.getByText("+1")).toBeInTheDocument();
  });
});
