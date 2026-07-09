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
