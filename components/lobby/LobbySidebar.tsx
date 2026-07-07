"use client";

import { useState } from "react";
import { Check, PanelRightClose } from "lucide-react";
import WeaponPool from "@/components/WeaponPool";
import PlayerCard from "@/components/PlayerCard";
import Spinner from "@/components/Spinner";
import Card from "@/components/ui/Card";
import type { LobbyMember } from "@/types/lobby";
import type { DestinyCharacter, WeaponSlot } from "@/types/bungie";
import type { InstancePerks, IntersectionAuthIssue, WeaponDetail } from "@/hooks/lobby/useWeaponPool";

// The lobby's right column (#224): the auto-compacting fireteam/guardian
// context card and the shared Weapon Browser, extracted verbatim from
// LobbyRoom's rightColumn block.

const CLASS_NAMES: Record<number, string> = { 0: "Titan", 1: "Hunter", 2: "Warlock" };
// Display order for the character picker: Warlock, Hunter, Titan (left to right).
const CLASS_ORDER = [2, 1, 0];

const CLASS_ICON_PATHS: Record<number, string> = {
  0: "/icons/class-titan.svg",
  1: "/icons/class-hunter.svg",
  2: "/icons/class-warlock.svg",
};

function EmblemThumbnail({ emblemPath, classType }: { emblemPath: string; classType: number }) {
  const [emblemFailed, setEmblemFailed] = useState(false);
  const [classIconFailed, setClassIconFailed] = useState(false);

  if (!emblemPath || emblemFailed) {
    if (classIconFailed) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/icons/destiny-default.svg"
          alt=""
          className="w-8 h-8 border border-white/10"
        />
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={CLASS_ICON_PATHS[classType] ?? CLASS_ICON_PATHS[0]}
        alt=""
        className="w-8 h-8 border border-white/10"
        onError={() => setClassIconFailed(true)}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.bungie.net${emblemPath}`}
      alt=""
      className="w-8 h-8 border border-white/10 object-cover"
      onError={() => setEmblemFailed(true)}
    />
  );
}

interface Props {
  members: LobbyMember[];
  characters: DestinyCharacter[];
  selectedCharId: string | null;
  onSelectCharacter: (characterId: string) => void;
  contextExpanded: boolean;
  onSetContextExpanded: (expanded: boolean) => void;
  isCaptain: boolean;
  isSpectator: boolean;
  intersection: Record<WeaponSlot, number[]> | null;
  effectiveIntersection: Record<WeaponSlot, number[]> | null;
  weaponDetails: Record<string, WeaponDetail>;
  instancePerks: InstancePerks;
  collectionHashes: Set<number>;
  weaponReleases: Record<string, number[]>;
  intersectionError: string | null;
  intersectionAuthIssue: IntersectionAuthIssue | null;
  currentUserId: string;
  reauthHref: string;
  poolLoading: boolean;
  actionDisabled: boolean;
  currentHashes: Record<string, number>;
  currentInstances: Partial<Record<WeaponSlot, string>>;
  favorites: Record<string, string>;
  onToggleFavorite: (slot: WeaponSlot, hash: number, instanceId: string) => void;
  onSelectWeapon: (slot: WeaponSlot, hash: number, instanceId?: string) => void;
  onLoadIntersection: () => void;
  onHide: () => void;
  // Meta lobbies already roll from the meta archetype set, so the browser's
  // own "Meta only" filter is redundant there (#284). Defaults to shown.
  showMetaFilter?: boolean;
}

export default function LobbySidebar({
  members,
  characters,
  selectedCharId,
  onSelectCharacter,
  contextExpanded,
  onSetContextExpanded,
  isCaptain,
  isSpectator,
  intersection,
  effectiveIntersection,
  weaponDetails,
  instancePerks,
  collectionHashes,
  weaponReleases,
  intersectionError,
  intersectionAuthIssue,
  currentUserId,
  reauthHref,
  poolLoading,
  actionDisabled,
  currentHashes,
  currentInstances,
  favorites,
  onToggleFavorite,
  onSelectWeapon,
  onLoadIntersection,
  onHide,
  showMetaFilter = true,
}: Props) {
  const [mobileSection, setMobileSection] = useState<"fireteam" | "weapons">("weapons");
  const currentUserNeedsReauth =
    intersectionAuthIssue?.failedUserIds.includes(currentUserId) ?? false;
  const failedNames = intersectionAuthIssue?.failedDisplayNames ?? [];
  const selectedChar = characters.find((c) => c.characterId === selectedCharId);
  const activeMembers = members.filter((m) => !m.is_spectator);
  const selectedMembers = activeMembers.filter((m) => m.selected_character_id);
  const fireteamReady = activeMembers.length > 0 && selectedMembers.length === activeMembers.length;
  const poolReady = Boolean(intersection || effectiveIntersection) && !intersectionAuthIssue && !poolLoading;

  return (
    <aside className="w-full xl:w-96 shrink-0 xl:sticky xl:top-6 xl:h-[calc(100vh-3rem)] flex flex-col">
      {/* Collapse the whole right column to give the loadout full width. */}
      <div className="flex justify-end shrink-0 mb-3">
        <button
          onClick={onHide}
          aria-label="Hide panel"
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 border border-bungie-border/40 px-2 py-1 transition"
        >
          <span className="xl:hidden">Hide</span>
          <PanelRightClose size={15} />
        </button>
      </div>

      <div className="xl:hidden grid grid-cols-2 gap-1 mb-3 border border-bungie-border bg-bungie-surface p-1">
        {(["fireteam", "weapons"] as const).map((section) => (
          <button
            key={section}
            onClick={() => setMobileSection(section)}
            className={`px-3 py-1.5 text-xs font-semibold transition ${
              mobileSection === section
                ? "bg-bungie-blue/20 text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {section === "fireteam" ? "Fireteam" : "Weapons"}
          </button>
        ))}
      </div>

      {/* Single scrollable area covering the context card + weapon pool. */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 pr-0.5">

      {/* Context: Fireteam + Your Guardian. Expandable by hand, but never
          auto-collapsed after guardian selection. */}
      <Card border="subtle" className={`shrink-0 ${mobileSection === "weapons" ? "hidden xl:block" : ""}`}>
        {!contextExpanded ? (
          <button
            onClick={() => onSetContextExpanded(true)}
            className="w-full px-3 py-2.5 text-left hover:bg-white/5 transition"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-xs text-gray-400 truncate">
                {members.length} in fireteam
                {(() => {
                  const selectedChar = characters.find((c) => c.characterId === selectedCharId);
                  return selectedChar
                    ? ` · Your Guardian: ${CLASS_NAMES[selectedChar.classType] ?? "Guardian"}`
                    : "";
                })()}
              </span>
              <span className="text-[10px] text-gray-500 shrink-0 uppercase tracking-wide">Change</span>
            </span>
          </button>
        ) : (
          <>
            {/* Fireteam */}
            <div className="px-3 pt-3 pb-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-widest text-gray-600">Fireteam</p>
                {selectedCharId && (
                  <button
                    onClick={() => onSetContextExpanded(false)}
                    className="text-[10px] text-gray-500 hover:text-gray-300 transition"
                  >
                    Collapse
                  </button>
                )}
              </div>
              <div className="space-y-0.5">
                {members.map((m) => (
                  <PlayerCard key={m.id} member={m} variant="sidebar" />
                ))}
              </div>
              {failedNames.length > 0 && (
                <p className="mt-2 border border-red-500/25 bg-red-500/10 px-2 py-1.5 text-[11px] leading-4 text-red-200">
                  Waiting on {failedNames.join(", ")} to sign in again.
                </p>
              )}
            </div>

            {/* Guardian picker */}
            {characters.length > 0 && !isSpectator && (
              <>
                <div className="mx-3 h-px bg-bungie-border/40" />
                <div className="px-3 pt-2 pb-3">
                  <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">Your Guardian</p>
                  <div className="space-y-1">
                    {[...characters]
                      .sort((a, b) => CLASS_ORDER.indexOf(a.classType) - CLASS_ORDER.indexOf(b.classType))
                      .map((c) => (
                        <button
                          key={c.characterId}
                          onClick={() => onSelectCharacter(c.characterId)}
                          className={`w-full flex items-center gap-2.5 px-2 py-1.5 border text-left transition ${
                            selectedCharId === c.characterId
                              ? "border-bungie-blue/50 bg-bungie-blue/10 text-white"
                              : "border-transparent text-gray-400 hover:border-bungie-border hover:text-gray-300"
                          }`}
                        >
                          <EmblemThumbnail emblemPath={c.emblemPath} classType={c.classType} />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold leading-tight">{CLASS_NAMES[c.classType] ?? "Guardian"}</p>
                            <p className="text-[10px] text-gray-500 leading-tight">Power {c.light}</p>
                          </div>
                          {selectedCharId === c.characterId && (
                            <Check size={14} className="ml-auto shrink-0 text-green-400" />
                          )}
                        </button>
                      ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </Card>

      {/* Shared weapon pool, always open, no internal scroll (parent scrolls).
          Once loaded, WeaponPool renders its own "Weapon Browser" header with
          the same count, so this heading only needs to appear before that
          (loading / not-yet-loaded states) to avoid two stacked titles for the
          same section (#208). */}
      {!isSpectator && (
        <div className={`flex flex-col gap-2 shrink-0 ${mobileSection === "fireteam" ? "hidden xl:flex" : ""}`}>
          <div className="flex items-center justify-between">
            {!intersection && (
              <h2 className="text-white font-semibold text-sm flex items-center gap-2">
                Shared Weapon Pool
                {effectiveIntersection && (
                  <span className="text-xs font-normal text-gray-500">
                    {effectiveIntersection.kinetic.length + effectiveIntersection.energy.length + effectiveIntersection.power.length} shared
                  </span>
                )}
              </h2>
            )}
            {!isCaptain && (
              <span className="text-[10px] uppercase tracking-wide text-gray-400 border border-bungie-border px-1.5 py-0.5 ml-auto">
                View only
              </span>
            )}
          </div>

          {intersection ? (
              <WeaponPool
                noScroll
                intersection={effectiveIntersection ?? intersection}
                weaponDetails={weaponDetails}
                instancePerks={instancePerks}
                collectionHashes={collectionHashes}
                weaponReleases={weaponReleases}
                currentHashes={currentHashes}
                currentInstances={currentInstances}
                onSelectWeapon={onSelectWeapon}
                favorites={favorites}
                onToggleFavorite={onToggleFavorite}
                disabled={actionDisabled}
                readOnly={!isCaptain}
                showMetaFilter={showMetaFilter}
              />
          ) : !isCaptain ? (
            <div className="border border-bungie-blue/60 bg-bungie-blue/10 p-4">
              <p className="text-gray-400 text-xs mb-3 leading-snug">
                Load your weapons so rolls only include guns everyone owns.
              </p>
              <button
                onClick={onLoadIntersection}
                disabled={actionDisabled}
                className="w-full px-4 py-2.5 bg-bungie-blue text-xs font-bold uppercase tracking-wider text-white hover:bg-[#26bcf3] disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2"
              >
                {poolLoading && <Spinner size={14} />}
                {poolLoading ? "Loading…" : "Load Shared Weapons"}
              </button>
              {intersectionError && (
                <InventoryAuthNotice
                  error={intersectionError}
                  currentUserNeedsReauth={currentUserNeedsReauth}
                  failedNames={failedNames}
                  reauthHref={reauthHref}
                />
              )}
            </div>
          ) : (
            <div className="panel p-4">
              <p className="text-sm text-gray-500 flex items-center gap-2">
                {poolLoading && <Spinner size={13} />}
                {poolLoading ? "Loading shared weapons…" : "Roll to load the shared weapon pool."}
              </p>
              {intersectionError && (
                <InventoryAuthNotice
                  error={intersectionError}
                  currentUserNeedsReauth={currentUserNeedsReauth}
                  failedNames={failedNames}
                  reauthHref={reauthHref}
                />
              )}
            </div>
          )}
        </div>
      )}

      </div>{/* end scrollable wrapper */}
    </aside>
  );
}

function InventoryAuthNotice({
  error,
  currentUserNeedsReauth,
  failedNames,
  reauthHref,
}: {
  error: string;
  currentUserNeedsReauth: boolean;
  failedNames: string[];
  reauthHref: string;
}) {
  return (
    <div className="mt-3 border border-red-500/30 bg-red-500/10 p-3">
      <p className="text-[10px] uppercase tracking-widest text-red-300/80">Sign-in required</p>
      <p className="mt-1 text-xs leading-5 text-red-100">
        {currentUserNeedsReauth
          ? "Your Bungie sign-in expired."
          : failedNames.length > 0
            ? `Waiting on ${failedNames.join(", ")} to sign in again.`
            : error}
      </p>
      {currentUserNeedsReauth ? (
        <a
          href={reauthHref}
          className="mt-3 inline-flex w-full items-center justify-center bg-bungie-blue px-3 py-2 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#26bcf3]"
        >
          Sign in with Bungie again
        </a>
      ) : failedNames.length > 0 ? (
        <p className="mt-2 text-[11px] leading-4 text-gray-400">Retries automatically.</p>
      ) : null}
    </div>
  );
}

