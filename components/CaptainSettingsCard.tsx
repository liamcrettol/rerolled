"use client";

import { Shuffle, Lock, User } from "lucide-react";
import type { LobbyRollSettings, SlotMode } from "@/types/lobby";
import type { WeaponSlot } from "@/types/bungie";

const SLOT_MODE_META: Record<SlotMode, { icon: typeof Shuffle; label: string }> = {
  normal: { icon: Shuffle, label: "Random" },
  lock: { icon: Lock, label: "Locked" },
  wildcard: { icon: User, label: "Your own" },
};

const SLOT_LABEL: Record<WeaponSlot, string> = {
  kinetic: "Kinetic",
  energy: "Energy",
  power: "Power",
};

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded border border-bungie-border text-gray-300">
      {children}
    </span>
  );
}

/**
 * Read-only summary of the captain's active roll settings, shown to non-captains
 * (issue #106). Updates live as the captain's lobby row changes.
 */
export default function CaptainSettingsCard({ settings }: { settings?: LobbyRollSettings | null }) {
  if (!settings) {
    return (
      <p className="text-xs text-gray-500">
        The captain hasn&apos;t changed any roll settings yet — using defaults.
      </p>
    );
  }

  const { mode, rerollLimit, noDup, banned, slots } = settings;

  return (
    <div className="space-y-3">
      <div>
        <span className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">Roll</span>
        <div className="flex flex-wrap gap-1.5">
          <Chip>Mode: <span className="capitalize text-white font-medium">{mode}</span></Chip>
          <Chip>Rerolls: <span className="text-white font-medium">{rerollLimit === null ? "∞" : rerollLimit}</span>/round</Chip>
          {noDup && <Chip>No duplicate types</Chip>}
        </div>
      </div>

      <div>
        <span className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">Slots</span>
        <div className="flex flex-wrap gap-1.5">
          {(["kinetic", "energy", "power"] as WeaponSlot[]).map((s) => {
            const meta = SLOT_MODE_META[slots[s]];
            const Icon = meta.icon;
            return (
              <Chip key={s}>
                {SLOT_LABEL[s]}:{" "}
                <span className="inline-flex items-center gap-1 text-white font-medium align-middle">
                  <Icon size={11} className="shrink-0" />
                  {meta.label}
                </span>
              </Chip>
            );
          })}
        </div>
      </div>

      {banned.length > 0 && (
        <div>
          <span className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1.5">Banned types</span>
          <div className="flex flex-wrap gap-1.5">
            {banned.map((t) => (
              <span
                key={t}
                className="text-xs px-2 py-0.5 rounded border border-red-700 bg-red-900/30 text-red-300 line-through"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
