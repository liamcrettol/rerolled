# Lobby Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cumulative kills leaderboard for players within a specific lobby/group, showing total kills across all games played in that lobby.

**Architecture:** 
- The watch page (server component) will query all games in a lobby and aggregate kills per player
- This data is passed to WatchView as initial state, similar to how `initialLastGame` is passed
- WatchView will display the lobby leaderboard below the "Last game" section using a table identical to the global leaderboard layout
- Since this is cumulative data that only updates when new games are logged, no real-time subscription is needed

**Tech Stack:** 
- Next.js server components (fetching)
- Supabase admin client (data queries)
- React client component (rendering table)

---

## File Structure

**Modified Files:**
- `app/watch/[code]/page.tsx` — Fetch lobby leaderboard data on the server
- `app/watch/[code]/WatchView.tsx` — Accept lobby leaderboard data and render it

---

## Task 1: Define Lobby Leaderboard Type

**Files:**
- Modify: `app/watch/[code]/WatchView.tsx:1-52` (type definitions)

**Context:** WatchView already defines types like `WatchGame` and `WatchGameStat` for the last game. Add a similar type for the lobby leaderboard.

- [ ] **Step 1: Add LobbyLeaderboardEntry type to WatchView**

Open `app/watch/[code]/WatchView.tsx` and add this type definition after the `WatchGame` interface (around line 41):

```typescript
export interface LobbyLeaderboardEntry {
  userId: string;
  displayName: string;
  gamesPlayed: number;
  totalKills: number;
}
```

This matches the data structure from the server (see Task 2).

- [ ] **Step 2: Commit type definition**

```bash
git add app/watch/[code]/WatchView.tsx
git commit -m "types: add LobbyLeaderboardEntry interface for lobby stats"
```

---

## Task 2: Fetch Lobby Leaderboard Data on Server

**Files:**
- Modify: `app/watch/[code]/page.tsx:49-71` (server data fetching)

**Context:** The watch page already fetches `initialLastGame` from game_sessions. We'll add a similar query to aggregate kills across all games in the lobby.

- [ ] **Step 1: Add lobby leaderboard fetch to watch page**

In `app/watch/[code]/page.tsx`, after the `lastSession` query (around line 49), add this new data fetch:

```typescript
// Fetch cumulative stats for all games in this lobby (for lobby leaderboard)
const { data: allGameStats } = await adminSupabase
  .from("game_sessions")
  .select("player_game_stats(user_id, display_name, kills)")
  .eq("lobby_id", lobby.id);

// Aggregate kills by user
const lobbyLeaderboardMap = new Map<string, { displayName: string; gamesPlayed: number; totalKills: number }>();
if (allGameStats) {
  for (const session of allGameStats) {
    const stats = session.player_game_stats || [];
    for (const stat of stats) {
      const existing = lobbyLeaderboardMap.get(stat.user_id);
      if (existing) {
        existing.gamesPlayed += 1;
        existing.totalKills += stat.kills;
      } else {
        lobbyLeaderboardMap.set(stat.user_id, {
          displayName: stat.display_name,
          gamesPlayed: 1,
          totalKills: stat.kills,
        });
      }
    }
  }
}

const initialLobbyLeaderboard = Array.from(lobbyLeaderboardMap.entries())
  .map(([userId, data]) => ({
    userId,
    displayName: data.displayName,
    gamesPlayed: data.gamesPlayed,
    totalKills: data.totalKills,
  }))
  .sort((a, b) => b.totalKills - a.totalKills);
```

This query:
1. Fetches all game_sessions for this lobby with their player_game_stats
2. Aggregates kills and game counts per user
3. Sorts by total kills (descending)

- [ ] **Step 2: Pass lobby leaderboard to WatchView**

Update the `WatchView` component call (around line 74) to include the new prop:

```typescript
<WatchView
  lobbyId={lobby.id}
  code={lobby.code}
  initialRoundNumber={lobby.current_round}
  initialRoundId={round?.id ?? null}
  initialSlots={initialSlots}
  initialMembers={initialMembers}
  initialStatus={lobby.status}
  initialLastGame={initialLastGame}
  initialLobbyLeaderboard={initialLobbyLeaderboard}
/>
```

- [ ] **Step 3: Commit server-side changes**

```bash
git add app/watch/[code]/page.tsx
git commit -m "feat: fetch lobby leaderboard data for watch page"
```

---

## Task 3: Update WatchView Props and Render Lobby Leaderboard

**Files:**
- Modify: `app/watch/[code]/WatchView.tsx:43-296` (props and render)

**Context:** WatchView needs to accept the new prop and render a leaderboard section below the "Last game" section.

- [ ] **Step 1: Update WatchView Props interface**

Update the `Props` interface (around line 43) to add the new prop:

```typescript
interface Props {
  lobbyId: string;
  code: string;
  initialRoundNumber: number;
  initialRoundId: string | null;
  initialSlots: LobbyLoadoutSlot[];
  initialMembers: WatchMember[];
  initialStatus: string;
  initialLastGame: WatchGame | null;
  initialLobbyLeaderboard: LobbyLeaderboardEntry[];
}
```

- [ ] **Step 2: Add state for lobby leaderboard**

Inside the `WatchView` function (after line 69), add state for the lobby leaderboard:

```typescript
const [lobbyLeaderboard, setLobbyLeaderboard] = useState<LobbyLeaderboardEntry[]>(initialLobbyLeaderboard);
```

- [ ] **Step 3: Render lobby leaderboard section**

After the "Last game" section render block (after line 291, before the closing `</div>`), add the lobby leaderboard section:

```typescript
      {/* Lobby leaderboard */}
      {lobbyLeaderboard.length > 0 && (
        <div className="mt-6">
          <h2 className="text-white font-semibold text-sm mb-2">Lobby Stats (All Games)</h2>
          <div className="overflow-x-auto rounded-xl border border-bungie-border bg-bungie-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-bungie-border">
                  <th className="text-left p-2 pl-3">#</th>
                  <th className="text-left p-2">Player</th>
                  <th className="text-right p-2">Kills</th>
                  <th className="text-right p-2 pr-3">Games</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bungie-border/40">
                {lobbyLeaderboard.map((entry, i) => (
                  <tr key={entry.userId} className={i === 0 ? "text-yellow-400" : "text-gray-300"}>
                    <td className="p-2 pl-3 text-gray-500 font-mono text-xs">{i + 1}</td>
                    <td className="p-2 font-medium">{trimBungieName(entry.displayName)}</td>
                    <td className="p-2 text-right font-bold text-bungie-blue">{entry.totalKills}</td>
                    <td className="p-2 text-right pr-3 text-xs">{entry.gamesPlayed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
```

This renders a table with:
- Rank number (1, 2, 3...)
- Player name (trimmed Bungie name)
- Total kills (highlighted in blue, gold for 1st place)
- Games played in the lobby

- [ ] **Step 4: Import trimBungieName if needed**

Check the imports at the top of WatchView (line 1-7). If `trimBungieName` is not imported from `@/lib/utils`, add it:

```typescript
import { trimBungieName } from "@/lib/utils";
```

(It's already imported on line 6, so no change needed.)

- [ ] **Step 5: Commit UI changes**

```bash
git add app/watch/[code]/WatchView.tsx
git commit -m "feat: add lobby leaderboard section to watch view"
```

---

## Task 4: Manual Testing

**Test Steps:**

- [ ] **Step 1: Create/join a test lobby**

1. Navigate to the application
2. Create a new lobby or join an existing one with multiple players
3. Play at least 2-3 games with different outcomes

- [ ] **Step 2: Open watch view and verify leaderboard**

1. Go to the watch page for that lobby (e.g., `/watch/XXXX`)
2. Scroll down and verify:
   - "Lobby Stats (All Games)" section appears
   - Players are listed in order by total kills (descending)
   - First player has yellow text (#1 rank)
   - Kill counts are correct (sum of all games)
   - Game counts are correct (number of games each player participated in)

- [ ] **Step 3: Play another game and refresh**

1. Play another round in the lobby
2. Refresh the watch page
3. Verify the leaderboard updated with new kills

- [ ] **Step 4: Test edge cases**

- Empty lobby (no games yet) — leaderboard section should not render
- Player with 0 kills — should still appear in leaderboard
- Player joined mid-lobby — should only count games they played in

- [ ] **Step 5: Commit test verification**

```bash
git commit -m "test: verify lobby leaderboard displays correctly and updates with new games"
```

---

## Summary

This implementation:
1. **Doesn't require a new API endpoint** — reuses the existing server data fetching pattern
2. **Mirrors the global leaderboard UI** — same table format for consistency
3. **Is performant** — aggregates data once on page load, no real-time subscription needed (cumulative data)
4. **Integrates cleanly** — passes data the same way as `initialLastGame`
5. **Handles edge cases** — empty lobbies won't render the section

**Verification checklist before marking done:**
- [ ] Lobby leaderboard appears below "Last game" section
- [ ] Shows all players who played in the lobby
- [ ] Sorts by total kills (highest first)
- [ ] First player highlighted in yellow
- [ ] Kill counts are correct (verified manually in a test lobby)
- [ ] Game counts are correct
- [ ] Empty lobbies don't show the section
- [ ] UI matches global leaderboard styling
