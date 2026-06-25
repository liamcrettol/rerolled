"use client";

import { useState } from "react";
import type { ApplyResult } from "@/types/lobby";
import { trimBungieName } from "@/lib/utils";

const SLOT_LABELS: Record<string, string> = {
  kinetic: "Kinetic",
  energy: "Energy",
  power: "Power",
};

const SLOT_BADGE_CLASSES: Record<string, string> = {
  kinetic: "text-gray-300 bg-gray-400/10 border-gray-400/30",
  energy: "text-bungie-blue bg-bungie-blue/10 border-bungie-blue/30",
  power: "text-purple-300 bg-purple-500/10 border-purple-500/30",
};

// Vault-clear rows ("made room") have no real slot — show a distinct neutral badge.
const VAULT_BADGE_CLASS = "text-amber-300/90 bg-amber-500/10 border-amber-500/30";

export default function ApplyStatus({
  results,
  onClear,
  onDismiss,
}: {
  results: ApplyResult[];
  onClear?: () => void;
  onDismiss?: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <div className="bg-bungie-surface border border-bungie-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="text-white font-semibold flex items-center gap-2">
          Transaction Logs
          <span className="text-xs font-medium text-gray-400 bg-bungie-dark border border-bungie-border px-2 py-0.5 rounded-full">
            {results.length} {results.length === 1 ? "transaction" : "transactions"}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="text-xs text-gray-400 hover:text-white border border-bungie-border hover:border-gray-500 rounded-md px-2.5 py-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-bungie-blue"
            >
              Clear all logs
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="shrink-0 text-gray-500 hover:text-gray-300 text-sm leading-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-bungie-blue"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      <div className="space-y-2">
        {results.map((r, i) => {
          const isVault = r.kind === "vault";
          const slotLabel = SLOT_LABELS[r.slot] ?? r.slot;
          const badgeLabel = isVault ? "Vaulted" : slotLabel;
          const badgeClass = isVault
            ? VAULT_BADGE_CLASS
            : SLOT_BADGE_CLASSES[r.slot] ?? SLOT_BADGE_CLASSES.kinetic;
          const weaponName = r.weapon_name ?? (isVault ? "Weapon" : slotLabel);
          const isOpen = expanded.has(i);
          const canExpand = !r.success;
          const detailText =
            r.error_detail && r.error_detail !== r.error ? r.error_detail : null;

          const rowInner = (
            <>
              <span
                className={`flex-shrink-0 uppercase tracking-wide text-[11px] font-bold px-2.5 py-1 rounded-md min-w-[76px] text-center border ${badgeClass}`}
              >
                {badgeLabel}
              </span>
              <span className="flex items-center gap-2 min-w-0">
                {r.weapon_icon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`https://www.bungie.net${r.weapon_icon}`}
                    alt=""
                    className="w-[30px] h-[30px] rounded border border-bungie-border flex-shrink-0"
                  />
                )}
                <span className="font-semibold text-white truncate">{weaponName}</span>
              </span>
              <span className="ml-auto text-gray-400 text-[13px] whitespace-nowrap">
                {trimBungieName(r.display_name)}
              </span>
              <span className="flex-shrink-0 text-[15px]">{r.success ? "✅" : "❌"}</span>
              {canExpand && (
                <span
                  className={`flex-shrink-0 w-4 text-center text-gray-400 transition-transform motion-reduce:transition-none ${
                    isOpen ? "rotate-180" : ""
                  }`}
                  aria-hidden="true"
                >
                  ⌄
                </span>
              )}
            </>
          );

          return (
            <div
              key={i}
              className={`rounded-lg overflow-hidden text-sm ${
                r.success
                  ? "bg-green-900/30 border border-green-700/40"
                  : "bg-red-900/30 border border-red-700/40"
              }`}
            >
              {canExpand ? (
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-bungie-blue"
                >
                  {rowInner}
                </button>
              ) : (
                <div className="flex items-center gap-3 px-3 py-2.5">{rowInner}</div>
              )}

              {canExpand && isOpen && (
                <div className="px-3 pb-3 ml-[88px]">
                  <div className="border-l-2 border-red-700/50 pl-3 flex flex-col gap-2 pt-1">
                    {r.error && <div className="text-gray-200 text-[13px]">{r.error}</div>}
                    {detailText && (
                      <div className="text-gray-400 text-xs font-mono">
                        <span className="block uppercase tracking-wide text-[10px] text-gray-500 mb-0.5 font-sans">
                          Detail
                        </span>
                        {detailText}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
