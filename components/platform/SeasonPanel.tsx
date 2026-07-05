import type { SeasonStats } from "@/types/platform";

// "Your Season" summary panel (#250). Persistent personal-status layer — reads
// real per-user data (mock for now) and stays clean for brand-new users.

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-bungie-border/55 last:border-b-0">
      <span className="text-xs text-gray-400 uppercase tracking-wider">{label}</span>
      <span className="font-mono slashed-zero text-sm text-white">{value}</span>
    </div>
  );
}

export default function SeasonPanel({ stats }: { stats: SeasonStats }) {
  const isEmpty = stats.totalRuns === 0;

  return (
    <section>
      <p className="section-label mb-3">
        Your Season · {stats.seasonName}
      </p>
      <div className="panel p-4">
        {isEmpty ? (
          <p className="text-sm text-gray-500 py-4 text-center">
            No runs yet. Roll a loadout to start your season.
          </p>
        ) : (
          <>
            <StatRow label="Total runs" value={stats.totalRuns.toLocaleString()} />
            <StatRow label="Roulette kills" value={stats.rouletteKills.toLocaleString()} />
            <StatRow label="Weeklies cleared" value={stats.weeklyChallengesCleared} />
            <StatRow
              label="Best placement"
              value={stats.bestWeeklyPlacement ? `#${stats.bestWeeklyPlacement}` : "—"}
            />
            <StatRow
              label="Best weapon"
              value={
                stats.bestWeapon ? (
                  <span className="text-bungie-blue">
                    {stats.bestWeapon.name}
                    {stats.bestWeapon.kills > 0 && (
                      <span className="text-gray-500 ml-2">{stats.bestWeapon.kills}</span>
                    )}
                  </span>
                ) : (
                  "—"
                )
              }
            />
          </>
        )}
      </div>
    </section>
  );
}
