import { render, screen } from "@testing-library/react";
import SeasonPanel from "@/components/platform/SeasonPanel";
import type { SeasonMatch, SeasonStats } from "@/types/platform";

function match(overrides: Partial<SeasonMatch> = {}): SeasonMatch {
  return {
    runId: "run-1",
    instanceId: "match-1",
    mode: "crucible",
    modeBucket: "competitive",
    modeName: "Competitive Clash",
    mapImage: "/img/map.jpg",
    playedAt: "2026-07-13T04:59:46.000Z",
    result: "win",
    activityName: "Rusted Lands",
    challengeTitle: null,
    featuredPlayer: null,
    featuredPlayerLabel: null,
    teamLabel: "Your Team",
    opponentLabel: "Enemy Team",
    teamScore: 35,
    opponentScore: 28,
    team: [],
    opponents: [],
    loadout: [],
    ...overrides,
  };
}

function stats(matches: SeasonMatch[]): SeasonStats {
  return {
    seasonKey: "2026-s0",
    seasonName: "Season 0",
    totalRuns: 0,
    rouletteKills: 0,
    weeklyChallengesCleared: 0,
    bestWeeklyPlacement: null,
    bestWeapon: null,
    matchHistory: matches,
    historySyncStatus: "complete",
  };
}

describe("SeasonPanel Rerolled match badges", () => {
  it.each([
    ["draft", "Draft"],
    ["loadout_roulette", "Loadout Roulette"],
  ] as const)("labels linked %s matches", (rerolledMode, label) => {
    render(<SeasonPanel stats={stats([match({ rerolledMode })])} variant="dashboard" />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("does not label ordinary Crucible matches", () => {
    render(<SeasonPanel stats={stats([match()])} variant="dashboard" />);
    expect(screen.queryByText("Draft")).not.toBeInTheDocument();
    expect(screen.queryByText("Loadout Roulette")).not.toBeInTheDocument();
  });
});
