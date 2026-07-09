import type { SeasonStats } from "@/types/platform";

// "Your Season" summary panel (#250). Persistent personal-status layer - reads
// real per-user data (mock for now) and stays clean for brand-new users.

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-bungie-border/55 py-2 last:border-b-0">
      <span className="text-xs uppercase tracking-wider text-gray-400">{label}</span>
      <span className="font-mono text-sm text-white slashed-zero">{value}</span>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone = "text-white",
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  tone?: string;
  className?: string;
}) {
  return (
    <div className={`border border-bungie-border bg-bungie-dark/55 p-4 ${className}`}>
      <p className="section-label mb-2">{label}</p>
      <div className={`font-mono text-2xl leading-tight slashed-zero ${tone}`}>{value}</div>
    </div>
  );
}

export default function SeasonPanel({
  stats,
  variant = "default",
}: {
  stats: SeasonStats;
  variant?: "default" | "dashboard";
}) {
  const isEmpty = stats.totalRuns === 0;

  if (variant === "dashboard") {
    return (
      <section className="h-full">
        <p className="section-label mb-4">Your Season / {stats.seasonName}</p>
        <div className="panel flex h-full min-h-[240px] flex-col p-5 xl:min-h-[446px]">
          {isEmpty ? (
            <div className="flex flex-1 items-center justify-center text-center">
              <div className="max-w-[18rem]">
                <p className="text-lg font-semibold text-white">No runs yet.</p>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">
                  Roll a loadout to start your season and fill this board.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <StatTile label="Total runs" value={stats.totalRuns.toLocaleString()} />
              <StatTile label="Roulette kills" value={stats.rouletteKills.toLocaleString()} />
              <StatTile label="Weeklies cleared" value={stats.weeklyChallengesCleared} />
              <StatTile
                label="Best placement"
                value={stats.bestWeeklyPlacement ? `#${stats.bestWeeklyPlacement}` : "-"}
                tone={stats.bestWeeklyPlacement ? "text-bungie-blue" : "text-gray-500"}
              />
              <StatTile
                label="Best weapon"
                value={
                  stats.bestWeapon ? (
                    <div className="space-y-1">
                      <div className="font-sans text-lg font-semibold uppercase tracking-wide text-bungie-blue">
                        {stats.bestWeapon.name}
                      </div>
                      <div className="text-xs text-gray-500">{stats.bestWeapon.kills.toLocaleString()} kills</div>
                    </div>
                  ) : (
                    "-"
                  )
                }
                tone={stats.bestWeapon ? "text-white" : "text-gray-500"}
                className="sm:col-span-2 xl:col-span-1 2xl:col-span-2"
              />
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
