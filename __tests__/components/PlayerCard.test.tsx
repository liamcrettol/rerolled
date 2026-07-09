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

// A 24px badge mark nested inside the 10px clan text row crushed the line box
// and shoved the mark onto the emblem art. It belongs in its own trailing slot.
describe("PlayerCard badge placement", () => {
  const clanned = makeMember({ clan_name: "Invictus" });
  const variants = ["default", "sidebar", "nav"] as const;

  it.each(variants)("keeps the badge out of the clan text row on the %s variant", (variant) => {
    const { container } = render(
      <PlayerCard member={clanned} badges={[makeBadge("a")]} variant={variant} />
    );

    const badgeSr = [...container.querySelectorAll(".sr-only")].find(
      (el) => el.textContent === "a. a description"
    );
    expect(badgeSr).toBeDefined();

    // Every text row in this card is a <span>. The badge chip is a <div>, so if
    // any <span> is an ancestor of it, the mark is nested in a text line again.
    expect(badgeSr!.parentElement?.closest("span")).toBeNull();

    // And the clan line still renders, unpolluted by the badge's sr-only text.
    const clanLine = [...container.querySelectorAll("span")].find(
      (el) => el.children.length === 0 && el.textContent === "Invictus"
    );
    expect(clanLine).toBeDefined();
    expect(clanLine!.closest("div")?.textContent).not.toContain("a. a description");
  });

  it("hides the badge for spectators, who have no nameplate to decorate", () => {
    const spectator = makeMember({ is_spectator: true });
    const { container } = render(
      <PlayerCard member={spectator} badges={[makeBadge("a")]} variant="sidebar" />
    );

    expect(container.querySelector(".sr-only")).toBeNull();
    expect(screen.getByText("spectating")).toBeInTheDocument();
  });
});
