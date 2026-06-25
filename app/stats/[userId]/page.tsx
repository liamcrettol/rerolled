import { adminSupabase } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

export const dynamic = "force-dynamic";

const SLOT_ORDER = ["kinetic", "energy", "power"] as const;

const TIER_COLOR: Record<string, string> = {
  Exotic: "text-yellow-400",
  Legendary: "text-purple-400",
  Rare: "text-blue-400",
};

type SlotRow = {
  round_id: string;
  slot: string;
  item_hash: number;
  weapon_name: string;
  weapon_icon: string;
  weapon_type: string;
};

export default async function PlayerStatsPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;

  const { data: rows } = await adminSupabase
    .from("player_game_stats")
    .select("*, game_sessions(id, played_at, round_id, map_name, is_private)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (!rows?.length) notFound();

  const displayName = rows[0].display_name;

  // ── Stats ──────────────────────────────────────────────────────────────
  const totalGames = rows.length;
  const totalKills = rows.reduce((s, r) => s + r.kills, 0);
  const totalDeaths = rows.reduce((s, r) => s + r.deaths, 0);
  const totalAssists = rows.reduce((s, r) => s + r.assists, 0);
  // Average of per-game KD values (not total kills / total deaths)
  const avgKD = rows.reduce((s, r) => s + Number(r.kd), 0) / rows.length;
  const wins = rows.filter((r) => r.won === true).length;
  const losses = rows.filter((r) => r.won === false).length;
  const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : null;

  const bestRound = [...rows].sort((a, b) => b.kills - a.kills)[0];
  const worstRound = [...rows].sort((a, b) => Number(a.kd) - Number(b.kd))[0];

  // ── Weapon data from lobby_loadout_slots ───────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roundIds = rows.map((r) => (r.game_sessions as any)?.round_id).filter(Boolean) as string[];

  let slotsByRound: Record<string, SlotRow[]> = {};
  if (roundIds.length > 0) {
    const { data: slotRows } = await adminSupabase
      .from("lobby_loadout_slots")
      .select("round_id, slot, item_hash, weapon_name, weapon_icon, weapon_type")
      .in("round_id", roundIds)
      .neq("item_hash", 0);

    for (const s of slotRows ?? []) {
      if (!slotsByRound[s.round_id]) slotsByRound[s.round_id] = [];
      slotsByRound[s.round_id].push(s as SlotRow);
    }
  }

  // Most rolled weapons — count per (item_hash, slot) across all the player's rounds
  const weaponCounts = new Map<number, { name: string; icon: string; type: string; tierName: string; count: number }>();
  for (const slots of Object.values(slotsByRound)) {
    for (const s of slots) {
      const existing = weaponCounts.get(s.item_hash);
      if (existing) {
        existing.count++;
      } else {
        weaponCounts.set(s.item_hash, {
          name: s.weapon_name,
          icon: s.weapon_icon,
          type: s.weapon_type,
          tierName: "",
          count: 1,
        });
      }
    }
  }
  const topWeapons = [...weaponCounts.entries()]
    .map(([hash, info]) => ({ hash, ...info }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <main className="min-h-screen p-6 w-full max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href="/dashboard" className="text-gray-500 hover:text-gray-300 text-sm transition">
          ← Dashboard
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">{displayName}</h1>
        <p className="text-gray-400 text-sm mt-1">Player stats across all Gun Roulette games</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-bungie-surface border border-bungie-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{totalGames}</p>
          <p className="text-gray-500 text-xs mt-1">Games</p>
          {winRate !== null && (
            <p className="text-xs mt-1">
              <span className="text-green-400">{wins}W</span>
              <span className="text-gray-600"> · </span>
              <span className="text-red-400">{losses}L</span>
              <span className="text-gray-500"> ({winRate}%)</span>
            </p>
          )}
        </div>
        <div className="bg-bungie-surface border border-bungie-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-bungie-blue">{totalKills}</p>
          <p className="text-gray-500 text-xs mt-1">Kills</p>
        </div>
        <div className="bg-bungie-surface border border-bungie-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{avgKD.toFixed(2)}</p>
          <p className="text-gray-500 text-xs mt-1">Avg K/D</p>
        </div>
        <div className="bg-bungie-surface border border-bungie-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-white">{totalKills}/{totalDeaths}/{totalAssists}</p>
          <p className="text-gray-500 text-xs mt-1">Total K/D/A</p>
        </div>
      </div>

      {/* Best / Roughest round */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-bungie-surface border border-bungie-border rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Best Round</p>
          <p className="text-yellow-400 font-bold text-lg">👑 {bestRound.kills} kills</p>
          <p className="text-gray-400 text-sm">{bestRound.kills}K / {bestRound.deaths}D · {Number(bestRound.kd).toFixed(2)} K/D</p>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(bestRound.game_sessions as any)?.map_name && (
            <p className="text-gray-600 text-xs mt-1">{(bestRound.game_sessions as any).map_name}</p>
          )}
        </div>
        <div className="bg-bungie-surface border border-bungie-border rounded-xl p-4">
          <p className="text-xs text-gray-500 mb-1">Roughest Round</p>
          <p className="text-red-400 font-bold text-lg">{worstRound.kills}K / {worstRound.deaths}D</p>
          <p className="text-gray-400 text-sm">{Number(worstRound.kd).toFixed(2)} K/D</p>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(worstRound.game_sessions as any)?.map_name && (
            <p className="text-gray-600 text-xs mt-1">{(worstRound.game_sessions as any).map_name}</p>
          )}
        </div>
      </div>

      {/* Most rolled weapons */}
      {topWeapons.length > 0 && (
        <div className="bg-bungie-surface border border-bungie-border rounded-xl overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-bungie-border">
            <h2 className="text-sm font-semibold text-white">Most Rolled Weapons</h2>
          </div>
          <div className="divide-y divide-bungie-border/40">
            {topWeapons.map((e) => (
              <div key={e.hash} className="flex items-center gap-3 px-4 py-3">
                <div className="relative w-10 h-10 shrink-0 rounded overflow-hidden bg-bungie-dark">
                  {e.icon ? (
                    <Image src={e.icon} alt={e.name} fill className="object-cover" unoptimized />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">?</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{e.name}</p>
                  <p className={`text-xs ${TIER_COLOR[e.type] ?? "text-gray-400"}`}>{e.type}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-bungie-blue font-bold text-sm">{e.count}×</p>
                  <p className="text-gray-500 text-xs">rolled</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Game history */}
      <div className="bg-bungie-surface border border-bungie-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-bungie-border">
          <h2 className="text-sm font-semibold text-white">Game History</h2>
        </div>
        <div className="divide-y divide-bungie-border/40">
          {rows.map((row) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const session = row.game_sessions as any;
            const roundId = session?.round_id as string | null;
            const slots = roundId ? (slotsByRound[roundId] ?? []) : [];
            const orderedSlots = SLOT_ORDER.map((s) => slots.find((x) => x.slot === s)).filter(Boolean) as SlotRow[];

            const date = session?.played_at
              ? new Date(session.played_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
              : "—";

            const isPrivate = session?.is_private === true;

            return (
              <div key={row.id} className="px-4 py-3 flex items-center gap-4">
                {/* Date + map */}
                <div className="w-28 shrink-0">
                  <p className="text-gray-400 text-xs">{date}</p>
                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                    {session?.map_name && (
                      <p className="text-gray-600 text-[10px] truncate">{session.map_name}</p>
                    )}
                    {isPrivate && (
                      <span className="text-[9px] font-semibold text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded px-1 py-0.5 shrink-0">Private</span>
                    )}
                  </div>
                </div>

                {/* W/L badge */}
                <div className="w-8 shrink-0 text-center">
                  {row.won === true && <span className="text-[10px] font-bold text-green-400 bg-green-400/10 border border-green-400/30 rounded px-1 py-0.5">W</span>}
                  {row.won === false && <span className="text-[10px] font-bold text-red-400 bg-red-400/10 border border-red-400/30 rounded px-1 py-0.5">L</span>}
                  {row.won === null && <span className="text-gray-600 text-xs">—</span>}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="text-center shrink-0">
                    <p className="text-white text-sm tabular-nums">{row.kills}/{row.deaths}/{row.assists}</p>
                    <p className="text-gray-600 text-[10px]">K/D/A</p>
                  </div>
                  <div className="text-center shrink-0">
                    <p className="text-gray-300 text-sm tabular-nums">{Number(row.kd).toFixed(2)}</p>
                    <p className="text-gray-600 text-[10px]">K/D</p>
                  </div>
                </div>

                {/* Weapon icons */}
                {orderedSlots.length > 0 && (
                  <div className="flex items-center gap-1 shrink-0">
                    {orderedSlots.map((s) => (
                      <div key={s.slot} className="relative w-8 h-8 rounded overflow-hidden bg-bungie-dark" title={s.weapon_name}>
                        <Image src={s.weapon_icon} alt={s.weapon_name} fill className="object-cover" unoptimized />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
