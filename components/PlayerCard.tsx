"use client";

import { useState } from "react";
import { Crown, Check } from "lucide-react";
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
            <div className="w-full h-full bg-bungie-border/30" />
          )}
        </div>
        <span className="text-xs font-medium truncate flex-1 min-w-0 flex items-center gap-1">
          {member.is_captain && <Crown size={12} className="shrink-0 text-yellow-400" />}
          <span className="truncate">{trimBungieName(member.display_name)}</span>
        </span>
        {!member.is_spectator && member.selected_character_id && (
          <Check size={13} className="text-green-400 shrink-0 animate-bounce-in" />
        )}
      </div>
    );
  }

  // Destiny nameplate: square emblem icon on the left, name (top) + clan (below)
  // left-aligned beside it, over the emblem banner. Captain = yellow border, no crown.
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
          {/* Legibility gradient over the text side (left → right). */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/45 to-black/65" />
        </>
      ) : (
        <div className="absolute inset-0 bg-bungie-dark" />
      )}

      {/* Emblem icon — left square, full height */}
      <div className={`relative z-10 shrink-0 ${compact ? "w-14 h-14" : "w-20 h-20"} border-r border-black/30`}>
        {iconUrl ? (
          <img
            src={iconUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setIconFailed(true)}
          />
        ) : (
          <div className="w-full h-full bg-bungie-border/30" />
        )}
      </div>

      {/* Name + clan, left-aligned beside the icon. */}
      <div className="relative z-10 flex-1 min-w-0 px-3 flex flex-col justify-center">
        <span
          className={`${compact ? "text-sm" : "text-base"} font-bold truncate leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]
            ${member.is_spectator ? "text-gray-300" : "text-white"}`}
        >
          {trimBungieName(member.display_name)}
        </span>
        {member.is_spectator ? (
          <span className="text-[11px] text-gray-300 leading-tight drop-shadow">spectating</span>
        ) : member.clan_name ? (
          <span className="text-[12px] text-gray-200/90 truncate leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {member.clan_name}
          </span>
        ) : null}
      </div>

      {/* Guardian-selected check, top-right corner */}
      {!member.is_spectator && member.selected_character_id && (
        <span className="absolute top-1 right-1.5 z-10 text-green-400 drop-shadow animate-bounce-in" aria-label="Guardian selected">
          <Check size={15} />
        </span>
      )}
    </div>
  );
}
