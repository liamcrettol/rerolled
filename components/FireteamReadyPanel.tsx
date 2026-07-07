import { Crown, Check } from "lucide-react";

// Sits beside HeroReel in the hero row as a second, complementary "proof"
// moment - HeroReel sells the roll itself, this sells the fireteam side of
// it. Purely decorative mock data (like HeroReel's filler weapons), so the
// names are blurred rather than spelled out as fake usernames and the whole
// panel is aria-hidden.
const MOCK_FIRETEAM = [
  { name: "VoidWalker_X", captain: true, ready: true },
  { name: "SolarFlare99", captain: false, ready: true },
  { name: "ArcStrike7", captain: false, ready: true },
  { name: "GhostWhisper", captain: false, ready: false },
];

export default function FireteamReadyPanel() {
  return (
    <div className="panel p-3 text-left w-48" aria-hidden="true">
      <p className="text-[9px] text-gray-500 uppercase tracking-widest mb-2">Fireteam Ready</p>
      <div className="flex flex-col gap-1.5">
        {MOCK_FIRETEAM.map((m) => (
          <div key={m.name} className="flex items-center gap-2 text-xs">
            {m.captain ? (
              <Crown size={12} className="text-yellow-400 shrink-0" aria-hidden="true" />
            ) : (
              <span className="w-3 shrink-0" />
            )}
            <span className={`truncate blur-[3px] select-none ${m.ready ? "text-green-400" : "text-gray-500"}`}>
              {m.name}
            </span>
            {m.ready && <Check size={12} className="text-green-500 shrink-0 ml-auto" aria-hidden="true" />}
          </div>
        ))}
      </div>
    </div>
  );
}
