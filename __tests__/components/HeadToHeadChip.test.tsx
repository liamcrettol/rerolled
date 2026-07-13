import { fireEvent, render, screen } from "@testing-library/react";
import HeadToHeadChip from "@/components/crucible/HeadToHeadChip";
import type { HeadToHeadSummary } from "@/lib/crucible/types";

const summary: HeadToHeadSummary = {
  opponentMembershipId: "123",
  opponentMembershipType: 3,
  opponentDisplayName: "Rival",
  encounters: 7,
  wins: 4,
  losses: 3,
  unknown: 0,
  lastPlayedAt: "2026-07-09T20:00:00Z",
  byMode: {
    trials: { encounters: 2, wins: 1, losses: 1, unknown: 0 },
    competitive: { encounters: 5, wins: 3, losses: 2, unknown: 0 },
  },
  recentMeetings: [{
    instanceId: "match-1",
    playedAt: "2026-07-09T20:00:00Z",
    mode: "competitive",
    modeName: "Competitive Clash",
    viewerWon: true,
    activityName: "Endless Vale",
  }],
};

describe("HeadToHeadChip", () => {
  it("opens an accessible record card and changes playlist totals", () => {
    render(<HeadToHeadChip summary={summary} opponentName="Rival" />);
    const trigger = screen.getByRole("button", { name: "Head-to-head record against Rival" });
    expect(trigger).toHaveTextContent("4-3");
    fireEvent.click(trigger);
    expect(screen.getByText(/Competitive Clash \/ Jul 9, 2026/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Endless Vale game report" })).toHaveAttribute(
      "href",
      "https://crucible.report/pgcr/match-1",
    );
    fireEvent.click(screen.getByRole("button", { name: /Trials 2/ }));
    expect(screen.getByText("1 W")).toBeInTheDocument();
    expect(screen.getByText("1 L")).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByText("Recent meetings")).not.toBeInTheDocument();
  });
});
