import { adminSupabase } from "@/lib/supabase/admin";
import Image from "next/image";
import { Crown } from "lucide-react";

type HallOfFameEntry = {
  item_hash: number;
  weapon_name: string | null;
  weapon_icon: string | null;
  weapon_type: string | null;
  total_kills: number;
  rounds_with_kills: number;
};

const TIER_COLOR: Record<string, string> = {
  Exotic: "text-yellow-400",
  Legendary: "text-purple-400",
  Rare: "text-blue-400",
};

export default async function WeaponHallOfFame() {
  const { data, error } = await adminSupabase.rpc("get_weapon_hall_of_fame", {
    p_limit: 10,
  }) as { data: HallOfFameEntry[] | null; error: unknown };

  if (error || !data?.length) {
    return (
      <div className="armory-panel p-6">
        <p className="armory-kicker mb-2">Kill archive</p>
        <h2 className="font-mono text-lg font-black uppercase text-white mb-2">Weapon Hall of Fame</h2>
        <p className="text-gray-500 text-sm">
          No roulette weapon kills yet. Weapons appear here after completed tracked games.
        </p>
      </div>
    );
  }

  return (
    <div className="armory-panel overflow-hidden animate-rise-in" style={{ opacity: 0, animationDelay: "80ms" }}>
      <div className="px-4 py-3 border-b border-bungie-border/60">
        <p className="armory-kicker mb-2">Kill archive</p>
        <h2 className="font-mono text-lg font-black uppercase text-white">Weapon Hall of Fame</h2>
        <p className="text-xs text-gray-500 mt-0.5">Top roulette weapons by total kills</p>
      </div>
      <div className="divide-y divide-bungie-border/40">
        {data.map((e, i) => (
          <div key={e.item_hash} className={`flex items-center gap-3 px-4 py-3 ${i === 0 ? "bg-yellow-400/5" : ""}`}>
            <span className="text-gray-400 font-mono text-sm w-5 text-right shrink-0">{i + 1}</span>
            <div className="relative w-10 h-10 shrink-0 rounded overflow-hidden bg-bungie-dark">
              {e.weapon_icon ? (
                <Image
                  src={e.weapon_icon}
                  alt={e.weapon_name ?? "Unknown weapon"}
                  fill
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">?</div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`font-medium text-sm truncate flex items-center gap-1 ${i === 0 ? "text-yellow-400" : "text-white"}`}>
                {i === 0 && <Crown size={13} className="shrink-0" />}
                {e.weapon_name ?? "Unknown Weapon"}
              </p>
              <p className={`text-xs ${TIER_COLOR[e.weapon_type ?? ""] ?? "text-gray-400"}`}>
                {e.weapon_type ?? "Unknown"}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-bungie-blue font-bold text-sm">{e.total_kills.toLocaleString()}</p>
              <p className="text-gray-500 text-xs">{e.rounds_with_kills} {e.rounds_with_kills === 1 ? "round" : "rounds"}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
