"use client";

import { useState } from "react";
import { trimBungieName } from "@/lib/utils";
import type { LobbyMember } from "@/types/lobby";

interface Props {
  member: LobbyMember;
  compact?: boolean;
  variant?: "default" | "sidebar";
}

export default function PlayerCard({ member, compact, variant = "default" }: Props) {
  const [bgFailed, setBgFailed] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);

  const bgUrl =
    !bgFailed && member.emblem_background_path
      ? `https://www.bungie.net${member.emblem_background_path}`
      : null;

  const iconUrl =
    !iconFailed && member.emblem_path
      ? `https://www.bungie.net${member.emblem_path}`
      : null;

  if (variant === "sidebar") {
    return (
      <div
        className={`flex items-center gap-2 px-1 py-1.5 rounded-lg ${
          member.is_captain ? "text-yellow-400" : member.is_spectator ? "text-gray-600 opacity-60" : "text-gray-300"
        }`}
      >
        <div className="relative shrink-0 w-[26px] h-[26px] rounded overflow-hidden border border-white/10">
          {iconUrl ? (
            <img src={iconUrl} alt="" className="w-full h-full object-cover" onError={() => setIconFailed(true)} />
          ) : (
            <div className="w-full h-full bg-bungie-border/30 flex items-center justify-center text-[10px]">
              {member.is_captain ? "👑" : "👤"}
            </div>
          )}
        </div>
        <span className="text-xs font-medium truncate flex-1 min-w-0">
          {member.is_captain && <span className="mr-1">👑</span>}
          {trimBungieName(member.display_name)}
        </span>
        {!member.is_spectator && member.selected_character_id && (
          <span className="text-green-400 text-xs shrink-0">✓</span>
        )}
      </div>
    );
  }

  // Banner-only card: the full emblem (emblem_background_path) IS the card — no
  // separate left icon square (that was a redundant second copy of the emblem).
  // Captain is conveyed by the yellow border, not a crown.
  return (
    <div
      className={`relative flex items-center rounded-lg overflow-hidden border w-full ${compact ? "h-14" : "h-20"}
        ${member.is_captain
          ? "border-yellow-500/60"
          : member.is_spectator
          ? "border-bungie-border opacity-60"
          : "border-bungie-border"
        }`}
    >
      {/* Emblem banner */}
      {bgUrl ? (
        <>
          {/* Hidden img to detect load failure */}
          <img
            src={bgUrl}
            alt=""
            className="hidden"
            onError={() => setBgFailed(true)}
          />
          <div
            className="absolute inset-0 bg-cover bg-left"
            style={{ backgroundImage: `url(${bgUrl})` }}
          />
          {/* Center-weighted scrim: darker behind the centered name, while the
              emblem art stays visible toward the edges. */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.62),rgba(0,0,0,0.28))]" />
        </>
      ) : (
        <div className="absolute inset-0 bg-bungie-dark" />
      )}

      {/* Name + clan, centered like the in-game nameplate. */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center px-4 w-full min-w-0">
        <span
          className={`${compact ? "text-sm" : "text-lg"} font-bold truncate max-w-full leading-tight drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]
            ${member.is_spectator ? "text-gray-300" : "text-white"}`}
        >
          {trimBungieName(member.display_name)}
        </span>
        {member.is_spectator ? (
          <span className="text-[10px] text-gray-300 leading-tight drop-shadow">spectating</span>
        ) : member.clan_name ? (
          <span className="text-[11px] text-gray-200/90 truncate max-w-full leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
            {member.clan_tag ? `[${member.clan_tag}] ` : ""}{member.clan_name}
          </span>
        ) : null}
      </div>

      {/* Guardian-selected check, tucked in the corner so it doesn't offset the
          centered name. */}
      {!member.is_spectator && member.selected_character_id && (
        <span className="absolute top-1 right-1.5 z-10 text-green-400 text-sm drop-shadow" title="Guardian selected">
          ✓
        </span>
      )}
    </div>
  );
}
