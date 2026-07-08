"use client";

import { useState } from "react";
import { Crown, Check } from "lucide-react";
import { trimBungieName } from "@/lib/utils";
import type { LobbyMember } from "@/types/lobby";
import EquippedBadges from "@/components/badges/EquippedBadges";
import type { DisplayBadge } from "@/lib/badges/data";

interface Props {
  member: LobbyMember;
  compact?: boolean;
  variant?: "default" | "sidebar";
  /** Up to 3 shown as small icons in the bottom-right corner (default variant
   * only). The default nameplate card is what Roll Comparison renders per
   * member, so this is where a Trials-Report-style badge strip belongs. */
  badges?: DisplayBadge[];
}

export default function PlayerCard({ member, compact, variant = "default", badges }: Props) {
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

  const bannerUrl = bgUrl ?? iconUrl;
  const bannerStyle = bannerUrl
    ? {
        backgroundImage: `url(${bannerUrl})`,
        backgroundSize: "100% 100%",
      }
    : undefined;

  if (variant === "sidebar") {
    return (
      <div
        className={`relative flex h-12 w-full items-center overflow-hidden border ${
          member.is_captain
            ? "border-yellow-500/60"
            : member.is_spectator
            ? "border-bungie-border opacity-60"
            : "border-bungie-border/70"
        }`}
      >
        {bannerUrl ? (
          <>
            <img
              src={bannerUrl}
              alt=""
              className="hidden"
              onError={() => (bgUrl ? setBgFailed(true) : setIconFailed(true))}
            />
            <div
              className="absolute inset-0 bg-center bg-no-repeat"
              style={bannerStyle}
            />
            <div className="absolute inset-0 bg-black/45" />
          </>
        ) : (
          <div className="absolute inset-0 bg-bungie-dark" />
        )}

        <div className="relative z-10 flex min-w-0 flex-1 items-center gap-2 px-2">
          <div className="shrink-0 w-7 h-7 overflow-hidden border border-white/15 bg-bungie-border/30">
            {iconUrl && (
              <img
                src={iconUrl}
                alt=""
                className="w-full h-full object-cover"
                onError={() => setIconFailed(true)}
              />
            )}
          </div>
          <span className="text-xs font-semibold truncate flex-1 min-w-0 flex items-center gap-1 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {member.is_captain && <Crown size={12} className="shrink-0 text-yellow-400" />}
            <span className="truncate">{trimBungieName(member.display_name)}</span>
          </span>
          {!member.is_spectator && member.selected_character_id && (
            <Check size={13} className="text-green-400 shrink-0 animate-fade-in drop-shadow" />
          )}
        </div>
      </div>
    );
  }

  // Destiny nameplate: long, thin emblem banner with a small square icon.
  // Captain gets a yellow border, not a crown.
  return (
    <div
      className={`relative flex items-center overflow-hidden border w-full ${compact ? "h-12" : "h-14"}
        ${member.is_captain
          ? "border-yellow-500/60"
          : member.is_spectator
          ? "border-bungie-border opacity-60"
          : "border-bungie-border"
        }`}
    >
      {/* Emblem banner */}
      {bannerUrl ? (
        <>
          <img
            src={bannerUrl}
            alt=""
            className="hidden"
            onError={() => (bgUrl ? setBgFailed(true) : setIconFailed(true))}
          />
          <div
            className="absolute inset-0 bg-center bg-no-repeat"
            style={bannerStyle}
          />
          <div className="absolute inset-0 bg-black/40" />
        </>
      ) : (
        <div className="absolute inset-0 bg-bungie-dark" />
      )}

      {/* Emblem icon */}
      <div className={`relative z-10 shrink-0 ml-1.5 ${compact ? "w-8 h-8" : "w-11 h-11"} overflow-hidden border border-white/15 bg-bungie-border/30`}>
        {iconUrl && (
          <img
            src={iconUrl}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setIconFailed(true)}
          />
        )}
      </div>

      {/* Name + clan, left-aligned beside the icon. */}
      <div className="relative z-10 flex-1 min-w-0 px-2.5 flex flex-col justify-center">
        <span
          className={`${compact ? "text-sm" : "text-base"} font-bold truncate leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]
            ${member.is_spectator ? "text-gray-300" : "text-white"}`}
        >
          {trimBungieName(member.display_name)}
        </span>
        {member.is_spectator ? (
          <span className="text-[11px] text-gray-300 leading-tight drop-shadow">spectating</span>
        ) : member.clan_name ? (
          <span className="text-[11px] text-gray-200/90 truncate leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {member.clan_name}
          </span>
        ) : null}
      </div>

      {/* Guardian-selected check, top-right corner */}
      {!member.is_spectator && member.selected_character_id && (
        <span className="absolute top-1 right-1.5 z-10 text-green-400 drop-shadow animate-fade-in" aria-label="Guardian selected">
          <Check size={14} />
        </span>
      )}

      {/* Equipped badges, bottom-right corner. Icon-only so it does not
          compete with the name/clan text on the emblem banner. */}
      {badges && badges.length > 0 && (
        <div className="absolute bottom-1 right-1.5 z-10">
          <EquippedBadges badges={badges} max={3} size="icon" />
        </div>
      )}
    </div>
  );
}
