import { Crown, Check } from "lucide-react";
import { EDGE } from "@/components/HeroReel";
import type { HeroWeaponSample } from "@/lib/bungie/definitions";
import type { WeaponSlot } from "@/types/bungie";

// Second signed-out landing "moment" (below the mode spotlight). Where
// HeroReel sells the random-roll chaos, this sells the other half of the
// pitch — the roll is drawn from the *intersection* of what the whole
// fireteam owns — with a static (server-rendered, no client JS) landed
// loadout + a mock ready-check roster. Not live/interactive, just proof.
const EXOTIC_TIER = 6;
const SLOT_ORDER: WeaponSlot[] = ["kinetic", "energy", "power"];

const MOCK_FIRETEAM = [
  { name: "VoidWalker_X", captain: true, ready: true },
  { name: "SolarFlare99", captain: false, ready: true },
  { name: "ArcStrike7", captain: false, ready: true },
  { name: "GhostWhisper", captain: false, ready: false },
];

export default function FireteamMoment({
  weaponsBySlot,
}: {
  weaponsBySlot: Record<WeaponSlot, HeroWeaponSample[]>;
}) {
  const tiles = SLOT_ORDER.map((slot) => weaponsBySlot[slot]?.[0]).filter(Boolean);
  if (tiles.length < 3) return null;

  return (
    <section className="w-full max-w-2xl flex flex-col items-center gap-6 text-center">
      <div>
        <p className="section-label text-bungie-blue mb-2">Fireteam Intersection</p>
        <h2 className="text-xl md:text-2xl font-bold text-white">
          Built from what your fireteam actually owns
        </h2>
        <p className="text-gray-400 text-sm mt-2 max-w-md mx-auto">
          Every roll only draws from weapons everyone in the lobby has unlocked. No whiffing on a gun your teammate never got.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-5">
        <div className="flex gap-2.5">
          {tiles.map((w, i) => (
            <div
              key={i}
              className="w-16 h-16 shrink-0 border border-white/10 bg-bungie-surface overflow-hidden"
              style={{ boxShadow: `0 0 0 1px ${w.tierType === EXOTIC_TIER ? EDGE.exotic : EDGE.legendary}` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={w.icon} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>

        <div className="panel p-3 text-left w-48">
          <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-2">Fireteam Ready</p>
          <div className="flex flex-col gap-1.5">
            {MOCK_FIRETEAM.map((m) => (
              <div key={m.name} className="flex items-center gap-2 text-xs">
                {m.captain ? (
                  <Crown size={12} className="text-yellow-400 shrink-0" aria-hidden="true" />
                ) : (
                  <span className="w-3 shrink-0" />
                )}
                <span className={`truncate ${m.ready ? "text-green-400" : "text-gray-500"}`}>{m.name}</span>
                {m.ready && <Check size={12} className="text-green-500 shrink-0 ml-auto" aria-hidden="true" />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
