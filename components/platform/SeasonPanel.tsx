import { ArrowUpRight, RefreshCw } from "lucide-react";
import type { SeasonMatch, SeasonMatchPlayer, SeasonStats } from "@/types/platform";
import HeadToHeadChip from "@/components/crucible/HeadToHeadChip";
import { crucibleModeLabel } from "@/lib/crucible/modes";

function formatKd(value: number | null) {
  return value === null ? "-" : value.toFixed(2);
}

function formatPlayedAt(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function normalizeBungieImage(path: string | null) {
  if (!path) return null;
  return path.startsWith("http") ? path : `https://www.bungie.net${path}`;
}

function resultClasses(result: SeasonMatch["result"]) {
  if (result === "win") return "border-green-500/35 bg-green-500/10 text-green-300";
  if (result === "loss") return "border-red-500/35 bg-red-500/10 text-red-300";
  return "border-bungie-border/70 bg-bungie-dark/50 text-gray-400";
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-bungie-border/55 py-2 last:border-b-0">
      <span className="text-xs uppercase tracking-wider text-gray-400">{label}</span>
      <span className="font-mono text-sm text-white slashed-zero">{value}</span>
    </div>
  );
}


function RosterRow({ player, syncStatus }: { player: SeasonMatchPlayer; syncStatus: SeasonStats["historySyncStatus"] }) {
  const emblemUrl = player.emblemPath
    ? (player.emblemPath.startsWith("http") ? player.emblemPath : `https://www.bungie.net${player.emblemPath}`)
    : null;

  return (
    <div className="relative isolate flex min-h-[4.25rem] items-center overflow-hidden border-b border-bungie-border/35 bg-bungie-dark/25 py-2.5 pl-16 pr-3 transition last:border-b-0 hover:bg-bungie-dark/55">
      {emblemUrl && (
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 -z-10 w-14 border-r border-white/10 bg-cover bg-center"
          style={{ backgroundImage: `url(${emblemUrl})` }}
        />
      )}
      {!emblemUrl && (
        <div aria-hidden="true" className="absolute inset-y-0 left-0 -z-10 flex w-14 items-center justify-center border-r border-white/10 bg-bungie-surface text-lg font-semibold text-gray-600">
          {player.displayName.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="absolute inset-y-0 left-14 -z-10 w-6 bg-gradient-to-r from-bungie-dark/45 to-transparent" />
      {player.headToHead && (
        <div className="absolute right-2 top-2 z-10">
          <HeadToHeadChip summary={player.headToHead} opponentName={player.displayName} syncStatus={syncStatus} />
        </div>
      )}
      <div className="min-w-0 flex-1 pr-8">
        {player.trialsReportUrl ? (
          <a
            href={player.trialsReportUrl}
            target="_blank"
            rel="noreferrer"
            className={`group inline-flex min-w-0 max-w-full items-center gap-1.5 font-semibold transition hover:text-bungie-blue ${player.isCurrentUser ? "text-bungie-blue" : "text-white"}`}
            aria-label={`Open ${player.displayName} on Trials Report`}
          >
            <span className="truncate text-sm">{player.displayName}</span>
            <ArrowUpRight size={11} className="shrink-0 text-gray-600 transition group-hover:text-bungie-blue" />
          </a>
        ) : (
          <p className={`truncate text-sm font-semibold ${player.isCurrentUser ? "text-bungie-blue" : "text-white"}`}>{player.displayName}</p>
        )}
        <div className="mt-1.5 flex items-baseline justify-between gap-2">
          <span className="truncate font-mono text-[9px] uppercase tracking-[0.1em] text-gray-500">
            {player.kills ?? 0}K / {player.deaths ?? 0}D / {player.assists ?? 0}A
          </span>
          <span className="shrink-0 font-mono text-xs text-white">{formatKd(player.kd)} K/D</span>
        </div>
      </div>
    </div>
  );
}

function MatchCard({ match, syncStatus }: { match: SeasonMatch; syncStatus: SeasonStats["historySyncStatus"] }) {
  const loadout = match.loadout.filter((slot) => slot.icon || slot.name);
  const mapImage = normalizeBungieImage(match.mapImage ?? null);
  const resultLabel = match.result === "win" ? "Win" : match.result === "loss" ? "Loss" : "Report";
  const modeLabel = match.mode === "crucible"
    ? (match.modeName ?? (match.modeBucket ? crucibleModeLabel(match.modeBucket) : "Crucible"))
    : match.mode === "weekly_challenge" ? "Weekly Challenge" : "Score Attack";
  const hasScore = match.teamScore !== null || match.opponentScore !== null;
  const scoreText = `${match.teamScore ?? "-"}${match.opponentScore !== null ? `-${match.opponentScore}` : ""}`;

  return (
    <article className="border border-bungie-border/80 bg-bungie-dark/35">
      {mapImage && (
        <div className="relative h-32 w-full overflow-hidden border-b border-bungie-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mapImage} alt="" className="h-full w-full object-cover object-center" />
          <div className="absolute inset-0 bg-black/45" />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3">
            <div className="min-w-0">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className={`border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.22em] ${resultClasses(match.result)}`}>{resultLabel}</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-gray-200">{modeLabel}</span>
              </div>
              <h3 className="truncate text-xl font-semibold uppercase tracking-[0.03em] text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.85)]">{match.activityName}</h3>
            </div>
            {hasScore && (
              <div className="shrink-0 border border-white/25 bg-black/45 px-3 py-1.5 text-right">
                <p className="font-mono text-lg leading-none text-white">{scoreText}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="p-4">
        {!mapImage && (
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.22em] ${resultClasses(match.result)}`}>{resultLabel}</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-gray-500">{modeLabel}</span>
              </div>
              <h3 className="mt-3 text-lg font-semibold uppercase tracking-[0.03em] text-white">{match.activityName}</h3>
            </div>
            {hasScore && (
              <div className="border border-bungie-border/70 bg-bungie-dark/60 px-3 py-2 text-right">
                <p className="section-label mb-1">Score</p>
                <p className="font-mono text-lg text-white">{scoreText}</p>
              </div>
            )}
          </div>
        )}

        <p className="text-xs uppercase tracking-[0.22em] text-gray-500">
          {formatPlayedAt(match.playedAt)}
          {match.challengeTitle ? ` / ${match.challengeTitle}` : ""}
        </p>
        {match.featuredPlayerLabel && (
          <p className="mt-3 text-sm text-gray-300">{match.featuredPlayerLabel}</p>
        )}

      {loadout.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {loadout.map((slot) => {
            const icon = normalizeBungieImage(slot.icon);
            return (
              <div key={slot.slot} className="flex items-center gap-2 border border-bungie-border/70 bg-bungie-dark/60 px-2.5 py-2">
                {icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={icon} alt="" className="h-8 w-8 shrink-0 bg-black/20 object-cover" />
                ) : (
                  <div className="h-8 w-8 shrink-0 bg-bungie-dark" />
                )}
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">{slot.slot}</p>
                  <p className="truncate text-xs font-medium text-white">{slot.name}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className={`mt-4 grid gap-3 ${match.opponents.length > 0 ? "lg:grid-cols-2" : ""}`}>
        <section className="border border-bungie-border/60 bg-bungie-dark/45">
          <div className="border-b border-bungie-border/55 px-3 py-2">
            <p className="section-label">{match.teamLabel}</p>
          </div>
          <div className="divide-y divide-bungie-border/35">
            {match.team.map((player) => <RosterRow key={player.membershipId} player={player} syncStatus={syncStatus} />)}
          </div>
        </section>

        {match.opponents.length > 0 && (
          <section className="border border-bungie-border/60 bg-bungie-dark/45">
            <div className="border-b border-bungie-border/55 px-3 py-2">
              <p className="section-label">{match.opponentLabel ?? "Opponents"}</p>
            </div>
            <div className="divide-y divide-bungie-border/35">
              {match.opponents.map((player) => <RosterRow key={player.membershipId} player={player} syncStatus={syncStatus} />)}
            </div>
          </section>
        )}
        </div>
      </div>
    </article>
  );
}

export default function SeasonPanel({
  stats,
  variant = "default",
}: {
  stats: SeasonStats;
  variant?: "default" | "dashboard";
}) {
  const isEmpty = stats.totalRuns === 0 && stats.matchHistory.length === 0;

  if (variant === "dashboard") {
    return (
      <section className="h-full">
        <p className="section-label mb-4">Your Season / {stats.seasonName}</p>
        <div className="panel flex min-h-[240px] flex-col p-5 xl:h-[calc(100vh-7rem)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="section-label">Historical Match Reports</p>
              {(stats.historySyncStatus === "queued" || stats.historySyncStatus === "syncing") && (
                <p className="mt-1 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.15em] text-bungie-blue/75">
                  <RefreshCw size={9} className="animate-spin" /> Importing Crucible history
                </p>
              )}
            </div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">
              {stats.matchHistory.length} recent
            </p>
          </div>

          {stats.matchHistory.length === 0 ? (
            <div className="flex flex-1 items-center justify-center border border-dashed border-bungie-border/70 bg-bungie-dark/25 px-5 text-center">
              <p className="max-w-[18rem] text-sm leading-relaxed text-gray-500">
                Historical reports will appear as your Crucible history is imported and Rerolled runs finish.
              </p>
            </div>
          ) : (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 max-h-[70vh] xl:max-h-none">
              {stats.matchHistory.map((match) => (
                <MatchCard key={match.instanceId ?? match.runId} match={match} syncStatus={stats.historySyncStatus} />
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section>
      <p className="section-label mb-3">Your Season / {stats.seasonName}</p>
      <div className="panel p-4">
        {isEmpty ? (
          <p className="py-4 text-center text-sm text-gray-500">
            No runs yet. Roll a loadout to start your season.
          </p>
        ) : (
          <>
            <StatRow label="Total runs" value={stats.totalRuns.toLocaleString()} />
            <StatRow label="Roulette kills" value={stats.rouletteKills.toLocaleString()} />
            <StatRow label="Weeklies cleared" value={stats.weeklyChallengesCleared} />
            <StatRow
              label="Best placement"
              value={stats.bestWeeklyPlacement ? `#${stats.bestWeeklyPlacement}` : "-"}
            />
            <StatRow
              label="Best weapon"
              value={
                stats.bestWeapon ? (
                  <span className="text-bungie-blue">
                    {stats.bestWeapon.name}
                    {stats.bestWeapon.kills > 0 && (
                      <span className="ml-2 text-gray-500">{stats.bestWeapon.kills}</span>
                    )}
                  </span>
                ) : (
                  "-"
                )
              }
            />
          </>
        )}
      </div>
    </section>
  );
}
