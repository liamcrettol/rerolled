"use client";

import { useEffect, useRef } from "react";

interface Props {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  rollMode: "normal" | "chaos" | "meta";
  onRollModeChange: (m: "normal" | "chaos" | "meta") => void;
  rerollLimit: number | null;
  onRerollLimitChange: (v: number | null) => void;
  rerollsUsed: number;
  noDupMode: boolean;
  onNoDupChange: (v: boolean) => void;
  bannedTypes: Set<string>;
  onBannedTypesChange: (next: Set<string>) => void;
  poolWeaponTypes: string[];
}

export default function RollSettingsPopover({
  anchorRef, onClose,
  rollMode, onRollModeChange,
  rerollLimit, onRerollLimitChange,
  rerollsUsed,
  noDupMode, onNoDupChange,
  bannedTypes, onBannedTypesChange,
  poolWeaponTypes,
}: Props) {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Dismiss on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [anchorRef, onClose]);

  const rerollExhausted = rerollLimit !== null && rerollsUsed >= rerollLimit;

  return (
    <div
      ref={popoverRef}
      className="absolute right-0 top-full mt-2 z-50 w-72 bg-bungie-surface border border-bungie-border/60 rounded-xl shadow-2xl p-4 space-y-4"
    >
      {/* Mode */}
      <div>
        <label className="block text-xs text-gray-400 mb-1.5">Roll Mode</label>
        <div className="flex gap-2">
          {(["normal", "chaos", "meta"] as const).map((m) => (
            <button
              key={m}
              onClick={() => onRollModeChange(m)}
              className={`flex-1 py-1.5 text-xs rounded-lg border capitalize transition ${
                rollMode === m
                  ? "border-bungie-blue bg-bungie-blue/20 text-white font-semibold"
                  : "border-bungie-border text-gray-400 hover:border-gray-400"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Reroll limit */}
      <div>
        <label className="block text-xs text-gray-400 mb-1.5">
          Rerolls / round
          {rerollLimit !== null && (
            <span className={`ml-2 font-semibold ${rerollExhausted ? "text-red-400" : "text-gray-300"}`}>
              {Math.max(0, rerollLimit - rerollsUsed)} left
            </span>
          )}
        </label>
        <div className="flex gap-2">
          {([null, 3, 5, 10] as const).map((v) => (
            <button
              key={String(v)}
              onClick={() => onRerollLimitChange(v)}
              className={`flex-1 py-1.5 text-xs rounded-lg border transition ${
                rerollLimit === v
                  ? "border-bungie-blue bg-bungie-blue/20 text-white font-semibold"
                  : "border-bungie-border text-gray-400 hover:border-gray-400"
              }`}
            >
              {v === null ? "∞" : v}
            </button>
          ))}
        </div>
      </div>

      {/* No duplicates */}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={noDupMode}
          onChange={(e) => onNoDupChange(e.target.checked)}
          className="accent-bungie-blue w-3.5 h-3.5"
        />
        <span className="text-xs text-gray-400">No duplicate weapon types</span>
      </label>

      {/* Ban weapon types */}
      {poolWeaponTypes.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-400">Ban weapon types</span>
            {bannedTypes.size > 0 && (
              <button
                onClick={() => onBannedTypesChange(new Set())}
                className="text-[11px] text-gray-500 hover:text-gray-300 transition"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {poolWeaponTypes.map((t) => {
              const banned = bannedTypes.has(t);
              return (
                <button
                  key={t}
                  onClick={() => {
                    const n = new Set(bannedTypes);
                    if (n.has(t)) n.delete(t); else n.add(t);
                    onBannedTypesChange(n);
                  }}
                  className={`text-xs px-2 py-0.5 rounded border transition ${
                    banned
                      ? "border-red-700 bg-red-900/30 text-red-300 line-through"
                      : "border-bungie-border text-gray-300 hover:border-gray-400"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
