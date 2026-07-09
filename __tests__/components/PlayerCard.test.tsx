import { render, screen } from "@testing-library/react";
import PlayerCard from "@/components/PlayerCard";
import type { LobbyMember } from "@/types/lobby";
import type { DisplayBadge } from "@/lib/badges/data";

function makeMember(overrides: Partial<LobbyMember> = {}): LobbyMember {
  return {
    id: "m1",
    lobby_id: "lobby1",
    user_id: "user1",
    display_name: "Guardian#1234",
    bungie_membership_type: 3,
    bungie_membership_id: "123",
    selected_character_id: null,
    emblem_path: null,
    emblem_background_path: null,
    clan_name: null,
    clan_tag: null,
    is_ready: false,
    is_captain: false,
    is_spectator: false,
    joined_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeBadge(slug: string): DisplayBadge {
  return {
    slug,
    status: "earned",
    name: slug,
    description: `${slug} description`,
    category: "completion",
    tier: "gold",
    mode: "core",
    iconKey: "laurel",
    earnedAt: "2026-01-01T00:00:00Z",
    sortOrder: 100,
    evidence: { sourceRunId: null, sourceWeeklyChallengeId: null, seasonId: null },
  };
}

describe("PlayerCard", () => {
  it("renders no badge strip when badges is omitted", () => {
    const { container } = render(<PlayerCard member={makeMember()} />);
    expect(container.querySelector(".sr-only")).not.toBeInTheDocument();
  });

  it("renders up to 3 equipped badges on the default nameplate", () => {
    const badges = [makeBadge("a"), makeBadge("b")];
    const { container } = render(<PlayerCard member={makeMember()} badges={badges} />);
    const srTexts = [...container.querySelectorAll(".sr-only")].map((el) => el.textContent);
    expect(srTexts).toContain("a. a description");
    expect(srTexts).toContain("b. b description");
  });

  it("shows badges on the compact sidebar variant too (#eff5ff9)", () => {
    const badges = [makeBadge("a")];
    render(<PlayerCard member={makeMember()} badges={badges} variant="sidebar" />);
    expect(screen.getByText("a. a description")).toBeInTheDocument();
  });
});

// The emblem banner is 474x96 with the 96x96 icon baked into its left edge.
// object-contain letterboxed it (a dead strip of flat background on every card
// wide enough to matter), so it's object-cover now. But cover scales the banner
// by width on wide cards, which grows that baked-in icon past any fixed px
// indent and slides the name on top of it - hence the percentage-aware
// pl-[max(22%,...)]. Both halves have to hold together or the card breaks.
describe("PlayerCard emblem banner geometry", () => {
  const withEmblem = makeMember({
    emblem_background_path: "/common/destiny2_content/icons/banner.jpg",
  });

  const variants = ["default", "sidebar", "nav"] as const;

  it.each(variants)("fills the card with the banner on the %s variant", (variant) => {
    const { container } = render(<PlayerCard member={withEmblem} variant={variant} />);
    const banner = container.querySelector('img[src*="banner.jpg"]');

    expect(banner).toBeInTheDocument();
    expect(banner).toHaveClass("object-cover");
    // object-contain leaves flat background showing wherever the card's aspect
    // ratio doesn't match the banner's 474:96.
    expect(banner).not.toHaveClass("object-contain");
  });

  it.each(variants)("indents the name past the baked-in icon on the %s variant", (variant) => {
    const { container } = render(<PlayerCard member={withEmblem} variant={variant} />);

    // A fixed px indent is only correct while the banner scales by height. The
    // max() keeps the name clear of the icon in the width-scaled regime too.
    const indent = [...container.querySelectorAll("div")].find((d) =>
      /pl-\[max\(22%,[\d.]+rem\)\]/.test(d.className)
    );

    expect(indent).toBeDefined();
    expect(indent).toHaveTextContent("Guardian");
  });

  it("does not draw a separate icon when the banner already bakes one in", () => {
    const both = makeMember({ emblem_path: "/icon.jpg", emblem_background_path: "/banner.jpg" });
    const { container } = render(<PlayerCard member={both} />);

    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelector("img")).toHaveAttribute("src", expect.stringContaining("banner.jpg"));
  });

  it("falls back to the bare icon as both backdrop and square when there is no banner", () => {
    const iconOnly = makeMember({ emblem_path: "/icon.jpg", emblem_background_path: null });
    const { container } = render(<PlayerCard member={iconOnly} />);

    expect(container.querySelectorAll('img[src*="icon.jpg"]')).toHaveLength(2);
  });
});
