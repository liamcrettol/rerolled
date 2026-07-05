"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Ban,
  ChevronLeft,
  Dices,
  Infinity,
  ListRestart,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import Spinner from "@/components/Spinner";

type RollMode = "normal" | "chaos" | "meta";

const WEAPON_TYPES: { label: string; types: string[] }[] = [
  {
    label: "Primary",
    types: [
      "Auto Rifle",
      "Hand Cannon",
      "Pulse Rifle",
      "Scout Rifle",
      "Sidearm",
      "Submachine Gun",
      "Combat Bow",
      "Trace Rifle",
    ],
  },
  {
    label: "Special",
    types: ["Shotgun", "Fusion Rifle", "Sniper Rifle", "Grenade Launcher", "Glaive"],
  },
  {
    label: "Heavy",
    types: ["Rocket Launcher", "Linear Fusion Rifle", "Machine Gun", "Sword", "Grenade Launcher"],
  },
];

const MODE_COPY: Record<RollMode, { title: string; body: string; icon: LucideIcon }> = {
  normal: {
    title: "Shared loadout",
    body: "Every player gets the same three-slot roll.",
    icon: ShieldCheck,
  },
  chaos: {
    title: "Independent rolls",
    body: "Each player gets their own weapon set.",
    icon: Dices,
  },
  meta: {
    title: "Usage-weighted",
    body: "Rolls lean toward higher-usage weapons.",
    icon: Sparkles,
  },
};

function PillSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 focus:outline-none ${
        checked ? "bg-bungie-blue/80 border-bungie-blue" : "bg-slate-950 border-bungie-border"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export default function NewLobbyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rollMode, setRollMode] = useState<RollMode>("normal");
  const [rerollLimit, setRerollLimit] = useState<number | null>(null);
  const [noDup, setNoDup] = useState(false);
  const [bannedTypes, setBannedTypes] = useState<Set<string>>(new Set());

  function toggleBan(type: string) {
    setBannedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/lobby/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            mode: rollMode,
            rerollLimit,
            noDup,
            banned: [...bannedTypes],
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/lobby/${data.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create lobby");
      setLoading(false);
    }
  }

  const bannedLabel = `${bannedTypes.size} weapon type${bannedTypes.size === 1 ? "" : "s"} banned`;
  const rerollLabel = rerollLimit === null ? "Unlimited" : `${rerollLimit} per round`;

  return (
    <div className="armory-shell min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <Link
          href="/dashboard"
          className="mb-7 inline-flex w-fit items-center gap-1.5 text-sm text-gray-400 transition hover:text-white"
        >
          <ChevronLeft size={16} />
          Back to Dashboard
        </Link>

        <header className="armory-panel mb-6 flex flex-col gap-5 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="armory-kicker mb-2">Fireteam setup</p>
            <h1 className="font-mono text-3xl font-black uppercase tracking-[-0.02em] text-white sm:text-4xl">Create Lobby</h1>
            <div className="armory-rule mt-3 w-44" />
          </div>
          <div className="hidden grid-cols-3 gap-2 text-xs text-gray-400 sm:grid sm:min-w-[430px]">
            <div className="armory-card p-3">
              <p className="mb-1 uppercase tracking-[0.2em] text-gray-600">Mode</p>
              <p className="capitalize text-white">{rollMode}</p>
            </div>
            <div className="armory-card p-3">
              <p className="mb-1 uppercase tracking-[0.2em] text-gray-600">Rerolls</p>
              <p className="text-white">{rerollLabel}</p>
            </div>
            <div className="armory-card p-3">
              <p className="mb-1 uppercase tracking-[0.2em] text-gray-600">Bans</p>
              <p className="text-white">{bannedTypes.size}</p>
            </div>
          </div>
        </header>

        <div className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <main className="space-y-5">
            <section className="armory-panel p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-2">
                <Dices size={18} className="text-bungie-blue" />
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-300">Roll mode</h2>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {(["normal", "chaos", "meta"] as RollMode[]).map((m) => (
                  <ModeButton key={m} mode={m} selected={rollMode === m} onClick={() => setRollMode(m)} />
                ))}
              </div>
            </section>

            <section className="grid gap-5 md:grid-cols-[minmax(0,1fr)_260px]">
              <div className="armory-panel p-4 sm:p-5">
                <div className="mb-4 flex items-center gap-2">
                  <ListRestart size={18} className="text-bungie-blue" />
                  <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-300">Rerolls per round</h2>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {([null, 1, 3, 5] as (number | null)[]).map((v) => (
                    <button
                      key={String(v)}
                      onClick={() => setRerollLimit(v)}
                      className={`min-h-16 border px-2 py-3 text-sm font-semibold transition ${
                        rerollLimit === v
                          ? "border-bungie-blue bg-bungie-blue/20 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                          : "border-bungie-border bg-black/20 text-gray-400 hover:border-gray-500 hover:text-gray-200"
                      }`}
                    >
                      {v === null ? <Infinity size={20} className="mx-auto" /> : v}
                      <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-gray-500 sm:tracking-[0.14em]">
                        {v === null ? "Open" : "Rerolls"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="armory-panel p-4 sm:p-5">
                <div className="flex h-full flex-col justify-between gap-5">
                  <div>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-white">No duplicates</p>
                      <PillSwitch checked={noDup} onChange={() => setNoDup((v) => !v)} />
                    </div>
                    <p className="text-xs leading-5 text-gray-500">Blocks duplicate kinetic and energy weapon types.</p>
                  </div>
                  <p className={`text-xs font-medium ${noDup ? "text-bungie-blue" : "text-gray-600"}`}>
                    {noDup ? "Duplicates blocked" : "Duplicates allowed"}
                  </p>
                </div>
              </div>
            </section>

            <section className="armory-panel p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Ban size={18} className="text-bungie-blue" />
                  <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-300">Ban weapon types</h2>
                </div>
                {bannedTypes.size > 0 && (
                  <button
                    onClick={() => setBannedTypes(new Set())}
                    className="text-xs font-medium text-gray-500 transition hover:text-gray-200"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <div className="grid gap-5 xl:grid-cols-3">
                {WEAPON_TYPES.map(({ label, types }) => (
                  <div key={label}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</p>
                    <div className="flex flex-wrap gap-2">
                      {types.map((t) => {
                        const banned = bannedTypes.has(t);
                        return (
                          <button
                            key={t}
                            onClick={() => toggleBan(t)}
                            aria-label={banned ? `${t} is banned from rolls` : `Ban ${t}`}
                            className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition ${
                              banned
                                ? "border-red-400/80 bg-red-500/15 text-red-100 shadow-[0_0_0_1px_rgba(248,113,113,0.16)]"
                                : "border-bungie-border bg-black/20 text-gray-400 hover:border-gray-500 hover:text-gray-200"
                            }`}
                          >
                            {banned && <span className="text-red-300" aria-hidden>×</span>}
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </main>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="armory-panel p-5">
              <p className="armory-kicker mb-4">Lobby rules</p>
              <div className="space-y-4">
                <SummaryRow label="Roll mode" value={MODE_COPY[rollMode].title} />
                <SummaryRow label="Rerolls" value={rerollLabel} />
                <SummaryRow label="Weapon bans" value={bannedLabel} />
                <SummaryRow label="Duplicates" value={noDup ? "Blocked" : "Allowed"} />
              </div>

              <div className="mt-5 border-t border-bungie-border pt-5">
                {bannedTypes.size > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {[...bannedTypes].sort().map((type) => (
                      <span key={type} className="rounded-full border border-red-400/40 bg-red-500/10 px-2.5 py-1 text-xs text-red-100">
                        {type}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No weapon types banned.</p>
                )}
              </div>

              {error && <p className="mt-5 border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}

              <button
                onClick={handleCreate}
                disabled={loading}
                className="armory-button mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 px-4 text-sm font-black uppercase tracking-wide transition disabled:opacity-50"
              >
                {loading && <Spinner size={15} />}
                {loading ? "Creating..." : "Create Lobby"}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function ModeButton({
  mode,
  selected,
  onClick,
}: {
  mode: RollMode;
  selected: boolean;
  onClick: () => void;
}) {
  const Icon = MODE_COPY[mode].icon;
  return (
    <button
      onClick={onClick}
      className={`min-h-32 border p-4 text-left transition ${
        selected
          ? "border-bungie-blue bg-bungie-blue/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          : "border-bungie-border bg-black/20 text-gray-400 hover:border-gray-500 hover:text-gray-200"
      }`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <Icon size={18} className={selected ? "text-bungie-blue" : "text-gray-500"} />
        <span className="text-xs font-semibold uppercase tracking-[0.18em]">{mode}</span>
      </div>
      <p className="text-sm font-semibold">{MODE_COPY[mode].title}</p>
      <p className="mt-1 text-xs leading-5 text-gray-500">{MODE_COPY[mode].body}</p>
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-bungie-border/70 pb-3 last:border-b-0 last:pb-0">
      <p className="text-xs uppercase tracking-[0.18em] text-gray-600">{label}</p>
      <p className="text-right text-sm font-medium text-white">{value}</p>
    </div>
  );
}
