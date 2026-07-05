// Active weekly challenge source (#245).
//
// SKELETON: returns a single hard-coded challenge so the home hero can be built
// before the durable weekly_challenge table + generator/publisher (#256) exist.
// The function signature is what the UI depends on — swap the body for a
// Supabase query later without touching the hero.

import type { WeeklyChallenge } from "@/types/platform";

// Window anchored a few days out so the countdown always reads as active during
// development. A real implementation reads starts_at/ends_at from the row.
function mockWindow(): { startsAt: string; endsAt: string } {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  return {
    startsAt: new Date(now - 3 * dayMs).toISOString(),
    endsAt: new Date(now + 3 * dayMs + 14 * 60 * 60 * 1000).toISOString(),
  };
}

const MOCK_WEEKLY: WeeklyChallenge = {
  id: "wk-42-mock",
  weekNumber: 42,
  seasonKey: "2026-summer",
  title: "Sidearm Supremacy",
  slug: "sidearm-supremacy",
  activityName: "GM: Lightblade",
  activityFamily: "gm",
  ...mockWindow(),
  rules: [
    { label: "Sidearm required", tone: "require" },
    { label: "No exotics", tone: "ban" },
    { label: "3 rerolls", tone: "neutral" },
  ],
  rerollCount: 3,
  globalSeed: "wk42-lightblade-sidearm",
  status: "active",
};

/**
 * Returns the current active weekly challenge, or null if none is running.
 * Async so the eventual DB-backed version is a drop-in replacement.
 */
export async function getActiveWeeklyChallenge(): Promise<WeeklyChallenge | null> {
  return MOCK_WEEKLY;
}
