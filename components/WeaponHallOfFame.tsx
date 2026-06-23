import { adminSupabase } from "@/lib/supabase/admin";
import weaponsTable from "@/lib/bungie/data/weapons-table.json";
import Image from "next/image";

type WeaponEntry = {
  name: string;
  icon: string;
  watermark?: string;
  weaponType: string;
  tierName: string;
  tierType: number;
};

const weapons = weaponsTable as Record<string, WeaponEntry>;

export default async function WeaponHallOfFame() {
  const { data } = await adminSupabase
    .from("weapon_round_kills")
    .select("item_hash, total_kills");

  if (!data?.length) {
    return (
      <div className="bg-bungie-surface border border-bungie-border rounded-xl p-6 text-center">
        <p className="text-gray-500 text-sm">No weapon data yet.</p>
      </div>
    );
  }

  // Aggregate kills per weapon hash
  const killMap = new Map<number, number>();
  for (const row of data) {
    killMap.set(row.item_hash, (killMap.get(row.item_hash) ?? 0) + row.total_kills);
  }

  const entries = [...killMap.entries()]
    .map(([hash, kills]) => {
      const def = weapons[hash.toString()];
      return { hash, kills, def };
    })
    .filter((e) => e.def)
    .sort((a, b) => b.kills - a.kills)
    .slice(0, 10);

  if (!entries.length) {
    return (
      <div className="bg-bungie-surface border border-bungie-border rounded-xl p-6 text-center">
        <p className="text-gray-500 text-sm">No weapon data yet.</p>
      </div>
    );
  }

  const TIER_LABEL_COLOR: Record<number, string> = {
    6: "text-yellow-400",
    5: "text-purple-400",
    4: "text-blue-400",
  };

  return (
    <div className="bg-bungie-surface border border-bungie-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-bungie-border">
        <h2 className="text-lg font-semibold text-white">Weapon Hall of Fame</h2>
        <p className="text-xs text-gray-500 mt-0.5">Top roulette weapons by total kills</p>
      </div>
      <div className="divide-y divide-bungie-border/40">
        {entries.map((e, i) => (
          <div key={e.hash} className="flex items-center gap-3 px-4 py-3">
            <span className="text-gray-600 font-mono text-sm w-5 text-right shrink-0">{i + 1}</span>
            <div className="relative w-10 h-10 shrink-0 rounded overflow-hidden bg-bungie-dark">
              <Image
                src={e.def.icon}
                alt={e.def.name}
                fill
                className="object-cover"
                unoptimized
              />
              {e.def.watermark && (
                <Image
                  src={e.def.watermark}
                  alt=""
                  fill
                  className="object-cover absolute inset-0"
                  unoptimized
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`font-medium text-sm truncate ${i === 0 ? "text-yellow-400" : "text-white"}`}>
                {i === 0 ? "👑 " : ""}{e.def.name}
              </p>
              <p className={`text-xs ${TIER_LABEL_COLOR[e.def.tierType] ?? "text-gray-400"}`}>
                {e.def.tierName} · {e.def.weaponType}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-bungie-blue font-bold text-sm">{e.kills}</p>
              <p className="text-gray-500 text-xs">kills</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
