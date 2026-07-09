import { render, screen, fireEvent, act } from "@testing-library/react";
import PlayerCard from "@/components/PlayerCard";
import BadgePopover from "@/components/badges/BadgePopover";
import type { LobbyMember } from "@/types/lobby";
import type { DisplayBadge } from "@/lib/badges/data";
import type { BadgeTier } from "@/types/badges";

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

function makeBadge(slug: string, tier: BadgeTier = "gold", earnedAt = "2026-01-01T00:00:00Z"): DisplayBadge {
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

const trigger = (c: HTMLElement) => c.querySelector('[tabindex="0"]')!;
const panel = () => document.body.querySelector('[role="tooltip"]');

// The close is debounced so the pointer can cross the gap into the panel.
function flushClose() {
  act(() => {
    jest.advanceTimersByTime(200);
  });
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe("BadgePopover", () => {
  it("stays closed until the strip is hovered", () => {
    const { container } = render(<BadgePopover badges={[makeBadge("a")]}>strip</BadgePopover>);
    expect(panel()).toBeNull();

    fireEvent.mouseEnter(trigger(container));
    expect(panel()).not.toBeNull();
  });

  it("shows just the badge list, without a count header", () => {
    const { container } = render(<BadgePopover badges={[makeBadge("a")]}>strip</BadgePopover>);
    fireEvent.mouseEnter(trigger(container));

    expect(screen.queryByText("1 Badge")).not.toBeInTheDocument();
    expect(screen.getByText("a description")).toBeInTheDocument();
  });

  it("renders nothing at all when the player has no badges", () => {
    const { container } = render(<BadgePopover badges={[]}>strip</BadgePopover>);
    expect(container).toBeEmptyDOMElement();
  });

  it("closes on Escape", () => {
    const { container } = render(<BadgePopover badges={[makeBadge("a")]}>strip</BadgePopover>);
    fireEvent.mouseEnter(trigger(container));
    expect(panel()).not.toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(panel()).toBeNull();
  });

  it("closes on scroll, since a fixed panel would detach from its trigger", () => {
    const { container } = render(<BadgePopover badges={[makeBadge("a")]}>strip</BadgePopover>);
    fireEvent.mouseEnter(trigger(container));

    fireEvent.scroll(window);
    expect(panel()).toBeNull();
  });

  it("opens on keyboard focus, not just hover", () => {
    const { container } = render(<BadgePopover badges={[makeBadge("a")]}>strip</BadgePopover>);
    fireEvent.focus(trigger(container));
    expect(panel()).not.toBeNull();
  });

  it("survives the pointer crossing the gap from trigger to panel", () => {
    const { container } = render(<BadgePopover badges={[makeBadge("a")]}>strip</BadgePopover>);
    fireEvent.mouseEnter(trigger(container));

    // Leaving the trigger schedules a close; entering the panel must cancel it.
    fireEvent.mouseLeave(trigger(container));
    fireEvent.mouseEnter(panel()!);
    flushClose();

    expect(panel()).not.toBeNull();
  });

  it("closes once the pointer leaves both trigger and panel", () => {
    const { container } = render(<BadgePopover badges={[makeBadge("a")]}>strip</BadgePopover>);
    fireEvent.mouseEnter(trigger(container));
    fireEvent.mouseLeave(trigger(container));
    flushClose();

    expect(panel()).toBeNull();
  });

  it("orders badges rarest tier first, then most recently earned", () => {
    const badges = [
      makeBadge("bronze-old", "bronze", "2026-01-01T00:00:00Z"),
      makeBadge("gold-old", "gold", "2026-01-01T00:00:00Z"),
      makeBadge("gold-new", "gold", "2026-06-01T00:00:00Z"),
      makeBadge("special", "special", "2026-01-01T00:00:00Z"),
    ];
    const { container } = render(<BadgePopover badges={badges}>strip</BadgePopover>);
    fireEvent.mouseEnter(trigger(container));

    const names = [...panel()!.querySelectorAll("li span:first-child")].map((n) => n.textContent);
    expect(names).toEqual(["special", "gold-new", "gold-old", "bronze-old"]);
  });
});

describe("BadgePopover on a PlayerCard", () => {
  // The strip caps at 2 marks on a compact card, but a player can own more. The
  // whole point of the popover is that the rest are reachable.
  const many = ["a", "b", "c", "d"].map((s) => makeBadge(s));

  it("lists every earned badge, not just the ones the strip has room for", () => {
    const { container } = render(<PlayerCard member={makeMember()} badges={many} compact />);
    fireEvent.mouseEnter(trigger(container));

    for (const slug of ["a", "b", "c", "d"]) {
      expect(screen.getByText(`${slug} description`)).toBeInTheDocument();
    }
  });

  it("escapes the card's overflow-hidden by portaling out of it", () => {
    const { container } = render(<PlayerCard member={makeMember()} badges={many} />);
    fireEvent.mouseEnter(trigger(container));

    const p = panel();
    expect(p).not.toBeNull();
    // Rendered inside the card, the panel would be cropped by its overflow-hidden root.
    expect(container.contains(p)).toBe(false);
    expect(document.body.contains(p)).toBe(true);
  });

  it("toggles on tap, since touch devices have no hover", () => {
    const { container } = render(<PlayerCard member={makeMember()} badges={many} />);
    fireEvent.click(trigger(container));
    expect(panel()).not.toBeNull();

    fireEvent.click(trigger(container));
    expect(panel()).toBeNull();
  });
});
