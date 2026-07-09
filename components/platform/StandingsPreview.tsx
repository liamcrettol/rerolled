import Link from "next/link";
import type { LeaderboardEntry } from "@/types/platform";

// Week standings preview (#249). Top rows + the current user's row when they're
// outside the top 3, with a link to the full leaderboard. Also used, without the
// footer link, as the row renderer on the full leaderboard page.

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function StandingsRow({ entry, showTime = true }: { entry: LeaderboardEntry; showTime?: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 border-b border-bungie-border/55 last:border-b-0 ${
        entry.isCurrentUser ? "bg-bungie-blue/10 border-l-2 border-l-bungie-blue" : ""
      }`}
    >
      <span className="font-mono slashed-zero text-sm text-gray-400 w-8 shrink-0">#{entry.rank}</span>
      <span className="text-sm text-white truncate flex-1 min-w-0">
        {entry.displayName}
        {entry.isCurrentUser && <span className="text-bungie-blue text-[10px] font-bold uppercase ml-2">You</span>}
      </span>
      {showTime && (
        <span className="font-mono slashed-zero text-xs text-gray-500 w-14 text-right shrink-0 hidden sm:block">
          {formatTime(entry.clearTimeSeconds)}
        </span>
      )}
      <span className="font-mono slashed-zero text-sm text-white w-16 text-right shrink-0">
        {entry.score.toLocaleString()}
      </span>
    </div>
  );
}

interface Props {
  entries: LeaderboardEntry[];
  /** Show the "view full leaderboard" footer link (home preview only). */
  showViewAll?: boolean;
  /** clearTimeSeconds is meaningless for PvP entries (#296) - hides the "Time" column when false. */
  showTime?: boolean;
}

export default function StandingsPreview({ entries, showViewAll = true, showTime = true }: Props) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <p className="section-label">Week Standings</p>
        {showViewAll && (
          <Link href="/leaderboards" className="text-[11px] font-bold uppercase tracking-widest text-gray-500 hover:text-bungie-blue">
            View all
          </Link>
        )}
      </div>
      <div className="panel">
        <div className="flex items-center gap-3 px-3 py-2 border-b border-bungie-border">
          <span className="section-label w-8 shrink-0">#</span>
          <span className="section-label flex-1">Guardian</span>
          {showTime && <span className="section-label w-14 text-right shrink-0 hidden sm:block">Time</span>}
          <span className="section-label w-16 text-right shrink-0">Score</span>
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-gray-500 px-3 py-6 text-center">No runs yet this week.</p>
        ) : (
          entries.map((e) => <StandingsRow key={`${e.rank}-${e.userId}`} entry={e} showTime={showTime} />)
        )}
      </div>
    </section>
  );
}
