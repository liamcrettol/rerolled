"use client";

import { useState } from "react";
import { trimBungieName } from "@/lib/utils";
import type { LobbyMember } from "@/types/lobby";

interface Props {
  member: LobbyMember;
}

export default function PlayerCard({ member }: Props) {
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

  return (
    <div
      className={`relative flex items-center gap-0 rounded-lg overflow-hidden border h-14 min-w-[200px] max-w-[280px]
        ${member.is_captain
          ? "border-yellow-500/60"
          : member.is_spectator
          ? "border-bungie-border opacity-60"
          : "border-bungie-border"
        }`}
    >
      {/* Emblem background banner */}
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
          {/* Dark gradient overlay so text stays legible */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-black/50 to-black/80" />
        </>
      ) : (
        <div className="absolute inset-0 bg-bungie-dark" />
      )}

      {/* Emblem icon — left square */}
      <div className="relative shrink-0 w-14 h-14">
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

      {/* Name + badges */}
      <div className="relative flex-1 flex items-center gap-2 px-3 min-w-0">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            {member.is_captain && <span className="text-xs">👑</span>}
            <span
              className={`text-sm font-semibold truncate leading-tight
                ${member.is_spectator ? "text-gray-500" : "text-white"}`}
            >
              {trimBungieName(member.display_name)}
            </span>
          </div>
          {member.is_spectator && (
            <span className="text-[10px] text-gray-500 leading-tight">spectating</span>
          )}
        </div>

        {!member.is_spectator && member.selected_character_id && (
          <span className="ml-auto shrink-0 text-green-400 text-xs" title="Guardian selected">
            ✓
          </span>
        )}
      </div>
    </div>
  );
}
