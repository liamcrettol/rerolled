"use client";

import { useState } from "react";
import { Check, PanelRightClose, Zap } from "lucide-react";
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
          className="w-8 h-8 rounded border border-white/10"
        />
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={CLASS_ICON_PATHS[classType] ?? CLASS_ICON_PATHS[0]}
        alt=""
        className="w-8 h-8 rounded border border-white/10"
        onError={() => setClassIconFailed(true)}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.bungie.net${emblemPath}`}
      alt=""
      className="w-8 h-8 rounded border border-white/10 object-cover"
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
  memberEquipped: Record<string, Partial<Record<WeaponSlot, number>>>;
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
  memberEquipped,
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
}: Props) {
  const currentUserNeedsReauth =
    intersectionAuthIssue?.failedUserIds.includes(currentUserId) ?? false;
  const failedNames = intersectionAuthIssue?.failedDisplayNames ?? [];

  return (
    <aside className="w-full xl:w-96 shrink-0 xl:sticky xl:top-6 xl:h-[calc(100vh-3rem)] flex flex-col">
      {/* Collapse the whole right column to give the loadout full width. */}
      <div className="flex justify-end shrink-0 mb-3">
        <button
          onClick={onHide}
          aria-label="Hide panel"
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 border border-bungie-border/40 rounded-lg px-2 py-1 transition"
        >
          <span className="xl:hidden">Hide</span>
          <PanelRightClose size={15} />
        </button>
      </div>

      {/* Single scrollable area covering the context card + weapon pool. */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 pr-0.5">

      {/* Context: Fireteam + Your Guardian + Settings. Auto-compacts into a
          single summary row once a guardian's picked, so it stops competing
          with the Weapon Browser for space (#204); expandable back on click. */}
      <Card border="subtle" className="shrink-0">
        {!contextExpanded ? (
          <button
            onClick={() => onSetContextExpanded(true)}
            className="w-full px-3 py-2.5 text-left hover:bg-white/5 transition rounded-xl"
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
            {/* Everyone's currently-equipped weapons, one icon-trio per member,
                so the reference stays visible even with the card collapsed. */}
            {(() => {
              const groups = members
                .filter((m) => !m.is_spectator && memberEquipped[m.user_id])
                .map((m) => ({
                  member: m,
                  details: (["kinetic", "energy", "power"] as WeaponSlot[]).map((s) => {
                    const h = memberEquipped[m.user_id]?.[s];
                    return h != null ? weaponDetails[h.toString()] : undefined;
                  }),
                }))
                .filter((g) => g.details.some((d) => d?.icon));
              if (groups.length === 0) return null;
              return (
                <span className="mt-1.5 flex items-center gap-2.5 flex-wrap">
                  {groups.map(({ member, details }) => (
                    <span
                      key={member.id}
                      className="flex items-center gap-1"
                    >
                      {details.map((d, i) =>
                        d?.icon ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={i} src={d.icon} alt={d.name} className="w-5 h-5 rounded-sm border border-white/10" />
                        ) : (
                          <span key={i} className="w-5 h-5 rounded-sm border border-white/5 bg-white/5" />
                        )
                      )}
                    </span>
                  ))}
                </span>
              );
            })()}
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
                {members.map((m) => {
                  // What this member is running right now (live from Bungie on
                  // every pool load) - a reference, not the rolled loadout.
                  const eq = memberEquipped[m.user_id];
                  const equippedDetails = !m.is_spectator && eq
                    ? (["kinetic", "energy", "power"] as WeaponSlot[])
                        .map((s) => (eq[s] != null ? weaponDetails[eq[s]!.toString()] : undefined))
                    : [];
                  const hasEquipped = equippedDetails.some((d) => d?.icon);
                  return (
                    <div key={m.id}>
                      <PlayerCard member={m} variant="sidebar" />
                      {hasEquipped && (
                        <div className="flex items-center gap-1 pl-[38px] pb-1.5 -mt-0.5">
                          {equippedDetails.map((d, i) =>
                            d?.icon ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                key={i}
                                src={d.icon}
                                alt={d.name}
                                className="w-5 h-5 rounded-sm border border-white/10"
                              />
                            ) : (
                              <span key={i} className="w-5 h-5 rounded-sm border border-white/5 bg-white/5" />
                            )
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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
                          className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg border text-left transition ${
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
        <div className="flex flex-col gap-2 shrink-0">
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
              <span className="text-[10px] uppercase tracking-wide text-gray-400 border border-bungie-border rounded px-1.5 py-0.5 ml-auto">
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
              />
          ) : !isCaptain ? (
            <div className="relative rounded-xl border-2 border-bungie-blue/60 bg-bungie-blue/10 p-4">
              <span className="absolute -inset-px rounded-xl border border-bungie-blue/40 animate-pulse pointer-events-none" />
              <p className="text-white text-sm font-semibold mb-1 flex items-center gap-1.5">
                <Zap size={15} className="text-bungie-blue" /> Load your shared weapons
              </p>
              <p className="text-gray-400 text-xs mb-3 leading-snug">
                Everyone needs to do this so the captain can roll a loadout you all own.
              </p>
              <button
                onClick={onLoadIntersection}
                disabled={actionDisabled}
                className="w-full px-4 py-2.5 bg-bungie-blue rounded-lg text-sm text-white font-semibold hover:opacity-90 disabled:opacity-50 transition inline-flex items-center justify-center gap-2"
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
            <div className="rounded-xl border border-bungie-border/40 bg-bungie-surface p-4">
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
    <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
      <p className="text-xs leading-5 text-red-200">{error}</p>
      {currentUserNeedsReauth ? (
        <a
          href={reauthHref}
          className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-bungie-blue px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90"
        >
          Sign in with Bungie again
        </a>
      ) : failedNames.length > 0 ? (
        <p className="mt-2 text-[11px] leading-4 text-gray-400">
          Waiting for {failedNames.join(", ")} to sign in again. This will retry automatically.
        </p>
      ) : null}
    </div>
  );
}
