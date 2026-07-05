"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Lobby, LobbyMember } from "@/types/lobby";
import type { DestinyCharacter } from "@/types/bungie";
import type { WeaponSlot } from "@/types/bungie";
import LoadoutQueue from "./LoadoutQueue";
import ApplyStatus from "./ApplyStatus";
import { signOut } from "next-auth/react";
import RollDetails from "./RollDetails";
import { trimBungieName } from "@/lib/utils";
import { useGameDetection } from "@/hooks/useGameDetection";
import Spinner from "./Spinner";
import ConfirmDialog from "./lobby/ConfirmDialog";
import LobbyStatsPanel, { type StatsTab, type LeaderboardEntry, type SessionTotal } from "./lobby/LobbyStatsPanel";
import LobbySidebar from "./lobby/LobbySidebar";
import { wildcardsFromSlots } from "@/lib/lobby/realtimeState";
import { useLobbySession } from "@/hooks/lobby/useLobbySession";
import { useRollState } from "@/hooks/lobby/useRollState";
import { useWeaponPool } from "@/hooks/lobby/useWeaponPool";
import { useRollInstances } from "@/hooks/lobby/useRollInstances";
import { useApplyLoadout } from "@/hooks/lobby/useApplyLoadout";
import { useRollActions } from "@/hooks/lobby/useRollActions";
import { Shuffle, Zap, Crown, Check, Copy, X, MoreHorizontal, PanelRightOpen, PanelRightClose, Clock } from "lucide-react";

interface Props {
  lobby: Lobby;
  initialMembers: LobbyMember[];
  currentUserId: string;
  currentUserDisplayName: string;
  bungieMembershipType: number;
  bungieMembershipId: string;
}

// Tone drives the status bar's visual weight: "turn" = an action is on you
// right now (most prominent), "info" = something's happening but not on you,
// "muted" = inert/ended.
const STATUS_TONE_CLS: Record<"turn" | "info" | "muted", string> = {
  turn: "border-yellow-500/60 bg-yellow-500/10 text-yellow-300",
  info: "border-bungie-blue/50 bg-bungie-blue/10 text-bungie-blue",
  muted: "border-bungie-border text-gray-400",
};

// Collapses lobby status + captain turn + spectator state into one explicit
// line instead of a cluster of small badges that read ambiguously together (#201).
function getLobbyStatusText(
  status: Lobby["status"],
  isCaptain: boolean,
  isSpectator: boolean
): { text: string; tone: "turn" | "info" | "muted" } {
  if (isSpectator) {
    if (status === "in_game") return { text: "In game", tone: "info" };
    if (status === "done") return { text: "Session ended", tone: "muted" };
    return { text: "Spectating", tone: "muted" };
  }
  switch (status) {
    case "waiting":
      return isCaptain
        ? { text: "Your turn to roll", tone: "turn" }
        : { text: "Waiting for the captain to roll", tone: "muted" };
    case "rolling":
      return isCaptain
        ? { text: "Loadout ready, apply when set", tone: "turn" }
        : { text: "Loadout ready · waiting on the captain to apply", tone: "info" };
    case "applying":
      return { text: "Applying loadout…", tone: "info" };
    case "in_game":
      return { text: "In game", tone: "info" };
    case "done":
      return { text: "Session ended", tone: "muted" };
    default:
      return { text: "Waiting", tone: "muted" };
  }
}

export default function LobbyRoom({
  lobby,
  initialMembers,
  currentUserId,
  bungieMembershipType,
  bungieMembershipId,
}: Props) {
  const router = useRouter();
  const [characters, setCharacters] = useState<DestinyCharacter[]>([]);
  // Pre-select the guardian this player already chose (persists across rounds/rejoins).
  const [selectedCharId, setSelectedCharId] = useState<string | null>(
    initialMembers.find((m) => m.user_id === currentUserId)?.selected_character_id ?? null
  );
  const [contextExpanded, setContextExpanded] = useState(true);

  const [preferredInstances, setPreferredInstancesState] = useState<Partial<Record<WeaponSlot, string>>>({});
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedWatch, setCopiedWatch] = useState(false);
  const hasAutoSelected = useRef(false);

  // Stats panel tab: session totals | match history | global leaderboard
  const [statsTab, setStatsTab] = useState<StatsTab>("session");
  const {
    polling,
    lastGameStats,
    setLastGameStats,
    roundHistory,
    expandedRound,
    setExpandedRound,
    startPolling,
    stopPolling,
  } = useGameDetection({
    lobbyId: lobby.id,
    // lobbyData.status isn't known until useLobbySession runs below; the
    // initial `lobby` prop is an acceptable seed since realtime immediately
    // syncs it and this hook re-subscribes on lobbyId, not status.
    status: lobby.status,
    onSwitchToHistoryTab: () => setStatsTab("history"),
  });
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  // Captain-only toggles
  const [captainLocked, setCaptainLocked] = useState(lobby.captain_locked ?? false);
  const [rightOpen, setRightOpen] = useState(true);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [showEndSessionConfirm, setShowEndSessionConfirm] = useState(false);
  // Confirmation for picking a second Special-ammo weapon into kinetic+energy
  // (leaves no Primary in the loadout) - styled like the End Session dialog
  // instead of a native browser confirm() (#187).
  const [pendingSpecialSelect, setPendingSpecialSelect] = useState<{
    slot: WeaponSlot; hash: number; instanceId?: string; otherName: string;
  } | null>(null);
  const [minutesToClose, setMinutesToClose] = useState<number | null>(null);
  const overflowMenuRef = useRef<HTMLDivElement>(null);

  const hasAutoLoaded = useRef(false);
  const hasSeeded = useRef(false);
  const prevMemberCount = useRef<number | null>(null);

  // Mirrors of values the realtime broadcast handler needs but that are
  // themselves derived from useLobbySession's own return value below — can't
  // be closed over directly without a circular hook call, so they're kept one
  // render behind via ref (same pattern the pre-#224 code used).
  const isCaptainRef = useRef(false);
  const isSpectatorRef = useRef(false);

  const {
    rollMode, setRollMode, noDupMode, setNoDupMode, bannedTypes, setBannedTypes,
    rerollLimit, setRerollLimit, rerollsUsed, rerollExhausted, noteRerollUsed,
    lockedSlots, setLockedSlots, wildcardSlots, setWildcardSlots,
    recentRollsRef, animKindRef, recordRoll, resetForNewRound,
  } = useRollState(lobby, isCaptainRef.current, lobby.current_round);

  const applyingRef = useRef(false);

  const {
    lobbyData, members, slots, roundId, isCaptain, isSpectator, isHost, seedSlots, sendCaptainApply,
  } = useLobbySession(
    lobby,
    initialMembers,
    currentUserId,
    useMemo(
      () => ({
        onSlotRolled: recordRoll,
        onRoundLoaded: (loadedSlots) => setWildcardSlots(wildcardsFromSlots(loadedSlots)),
        onRoundAdvance: () => {
          resetForNewRound();
          clearApplyResults();
          setPreferredInstancesState({});
          hasAutoLoaded.current = false;
          hasSeeded.current = false;
        },
        onCaptainApply: () => {
          if (!autoApply || isSpectatorRef.current || isCaptainRef.current) return;
          if (applyingRef.current) return;
          handleApplyRef.current?.();
        },
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [recordRoll]
    )
  );

  useEffect(() => { isCaptainRef.current = isCaptain; }, [isCaptain]);
  useEffect(() => { isSpectatorRef.current = isSpectator; }, [isSpectator]);

  const {
    intersection, effectiveIntersection, weaponDetails, instancePerks, collectionHashes,
    weaponReleases, equippedHashes, intersectionError, intersectionAuthIssue, loading: poolLoading,
    loadIntersection, weaponDisplayType,
  } = useWeaponPool(lobby.id, bannedTypes);
  void weaponDisplayType;

  const {
    rollsData, myChosenInstances, rollsLoading, rollsError, favorites, toggleFavorite,
    handleChooseInstance, fetchRolls, slotKey,
  } = useRollInstances(lobby.id, roundId, slots);

  const {
    applyResults, clearApplyResults, applying, autoApply, toggleAutoApply, handleApply, handleCancelApply,
  } = useApplyLoadout({
    lobbyId: lobby.id,
    roundId,
    selectedCharId,
    isCaptain,
    getPreferredInstances: () => ({ ...preferredInstances, ...myChosenInstances }),
    sendCaptainApply,
    startPolling,
  });
  useEffect(() => { applyingRef.current = applying; }, [applying]);

  // Stable ref to the latest handleApply so the broadcast callback (built
  // above, before handleApply exists) always calls the current version.
  const handleApplyRef = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => { handleApplyRef.current = handleApply; }, [handleApply]);

  const {
    rolling, cycleSlotMode, handleRoll, handleSelectWeapon,
  } = useRollActions({
    lobbyId: lobby.id,
    roundId,
    slots,
    intersection,
    effectiveIntersection,
    weaponDetails,
    rollMode,
    noDupMode,
    rerollExhausted,
    noteRerollUsed,
    lockedSlots,
    setLockedSlots,
    wildcardSlots,
    setWildcardSlots,
    recentRollsRef,
    animKindRef,
    setPreferredInstances: setPreferredInstancesState,
    dismissLastGame: () => setLastGameStats(null),
    onConfirmSpecial: setPendingSpecialSelect,
  });

  const loadingAction: string | null = rolling ? "roll" : applying ? "apply" : poolLoading ? "intersection" : null;
  const currentUserNeedsReauth = intersectionAuthIssue?.failedUserIds.includes(currentUserId) ?? false;
  const reauthHref = `/api/auth/bungie/login?reauth=1&returnTo=${encodeURIComponent(`/lobby/${lobby.code}`)}`;
  const hasRolledLoadout = slots.some((s) => s.item_hash !== 0);
  const rollDisabledReason =
    loadingAction === "roll" ? "Rolling now"
    : loadingAction === "apply" ? "Applying loadout"
    : loadingAction === "intersection" ? "Loading shared weapons"
    : rerollExhausted ? "No rerolls left this round"
    : !intersection ? "Load shared weapons first"
    : null;
  const applyDisabledReason =
    loadingAction === "apply" ? "Applying now"
    : loadingAction === "roll" ? "Wait for the roll to finish"
    : loadingAction === "intersection" ? "Loading shared weapons"
    : !selectedCharId ? "Select a Guardian first"
    : slots.length < 3 ? "Roll all three slots first"
    : null;

  // Keep captainLocked in sync with real-time lobby updates
  useEffect(() => { setCaptainLocked(lobbyData.captain_locked ?? false); }, [lobbyData.captain_locked]);

  // Track time remaining until the idle auto-close (2 h without activity).
  // Refreshes every 30 s so the countdown stays accurate.
  useEffect(() => {
    const IDLE_CLOSE_MS = 2 * 60 * 60 * 1000;
    function update() {
      if (!lobbyData.last_active_at || lobbyData.status === "done") {
        setMinutesToClose(null);
        return;
      }
      const elapsed = Date.now() - new Date(lobbyData.last_active_at).getTime();
      setMinutesToClose(Math.max(0, Math.floor((IDLE_CLOSE_MS - elapsed) / 60_000)));
    }
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [lobbyData.last_active_at, lobbyData.status]);

  // Running cumulative stats per player across every recorded game this lobby.
  const sessionTotals = useMemo(() => {
    const m = new Map<string, SessionTotal>();
    for (const round of roundHistory) {
      for (const s of round.stats) {
        const e = m.get(s.userId) ?? { userId: s.userId, displayName: trimBungieName(s.displayName), kills: 0, deaths: 0, assists: 0, rouletteWeaponKills: 0, games: 0 };
        e.kills += s.kills;
        e.deaths += s.deaths;
        e.assists += s.assists;
        e.rouletteWeaponKills += s.rouletteWeaponKills;
        e.games += 1;
        e.displayName = trimBungieName(s.displayName);
        m.set(s.userId, e);
      }
    }
    return [...m.values()];
  }, [roundHistory]);

  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(lobby.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable; ignore */ }
  }, [lobby.code]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/join/${lobby.code}`);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1500);
    } catch { /* clipboard unavailable; ignore */ }
  }, [lobby.code]);

  const copyWatchLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/watch/${lobby.code}`);
      setCopiedWatch(true);
      setTimeout(() => setCopiedWatch(false), 1500);
    } catch { /* clipboard unavailable; ignore */ }
  }, [lobby.code]);

  useEffect(() => {
    fetch("/api/bungie/characters")
      .then((r) => r.json())
      .then((d) => { if (d.characters) setCharacters(d.characters); });
  }, []);

  const handleLoadIntersection = useCallback(
    () => loadIntersection(selectedCharId),
    [loadIntersection, selectedCharId]
  );

  // Auto-load the shared pool for any participant (not just the captain) once
  // the round is ready, so a joining member doesn't have to click "Load Shared
  // Weapons" themselves. The captain's load also seeds the initial roll;
  // non-captains just populate their pool view.
  useEffect(() => {
    if (hasAutoLoaded.current) return;
    if (isSpectator || !roundId) return;
    hasAutoLoaded.current = true;
    handleLoadIntersection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpectator, roundId]);

  // When a new non-spectator joins, refresh the pool for everyone already
  // loaded — without re-rolling — so the captain's pool reflects the new member
  // without a manual reload. Skipped during an active game.
  useEffect(() => {
    const count = members.filter((m) => !m.is_spectator).length;
    if (prevMemberCount.current === null) { prevMemberCount.current = count; return; }
    const prev = prevMemberCount.current;
    prevMemberCount.current = count;
    if (!hasAutoLoaded.current || count <= prev) return;
    if (lobbyData.status === "in_game") return;
    handleLoadIntersection();
    // Refresh the comparison so the new member's rolls appear without waiting
    // for a slot change (fetchRolls otherwise only re-runs on slot changes).
    if (slots.some((s) => s.item_hash !== 0)) fetchRolls();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, lobbyData.status]);

  // If an inventory load failed because someone's Bungie auth needs refreshing,
  // a successful reauth touches that member row and arrives here as realtime.
  // Retry for everyone automatically instead of requiring browser refreshes.
  useEffect(() => {
    if (!intersectionAuthIssue || poolLoading || isSpectator) return;
    if (!hasAutoLoaded.current) return;
    if (lobbyData.status === "in_game") return;
    handleLoadIntersection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);

  // Seed the captain's loadout from their equipped weapons once the pool is
  // loaded and the round has no loadout yet, so the Roll Comparison reflects
  // their equipped guns immediately (Roll All only randomizes). Runs once per
  // round and never overwrites an existing/rolled loadout.
  useEffect(() => {
    if (hasSeeded.current) return;
    if (!isCaptain || !roundId || !intersection) return;
    if (slots.some((s) => s.item_hash !== 0)) { hasSeeded.current = true; return; }
    const seedRoundId = roundId;
    const keep: Record<string, number> = {};
    for (const s of ["kinetic", "energy", "power"] as WeaponSlot[]) {
      if (wildcardSlots.has(s)) continue;
      if (equippedHashes[s] != null) keep[s] = equippedHashes[s]!;
    }
    // The whole point of the seed is showing the captain's EQUIPPED loadout.
    // If the equipped hashes haven't arrived (or came back empty), don't fall
    // through to a random roll - leave the round unseeded and let a later
    // effect run (equippedHashes is a dep) seed it properly.
    if (Object.keys(keep).length === 0) return;
    hasSeeded.current = true;
    (async () => {
      try {
        const res = await fetch("/api/roulette/roll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lobbyId: lobby.id, roundId: seedRoundId, intersection,
            weaponDetails,
            keepSlots: Object.keys(keep).length > 0 ? keep : undefined,
            wildcardSlots: Array.from(wildcardSlots),
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.roll) { hasSeeded.current = false; return; }
        // Reflect the seeded loadout locally right away. The seeding client
        // otherwise waits on the realtime echo of its own write, which is why
        // the captain stayed empty while viewers already saw the comparison.
        const now = new Date().toISOString();
        const seeded = [];
        for (const s of wildcardSlots) {
          seeded.push({
            id: `seed-${seedRoundId}-${s}`, round_id: seedRoundId, slot: s, item_hash: 0,
            weapon_name: "?", weapon_icon: "", weapon_type: "Any", damage_type: "Any",
            locked_by_user_id: currentUserId, created_at: now,
          });
        }
        for (const s of ["kinetic", "energy", "power"] as WeaponSlot[]) {
          const hash = data.roll[s];
          if (!hash) continue;
          const detail = weaponDetails[hash.toString()];
          seeded.push({
            id: `seed-${seedRoundId}-${s}`, round_id: seedRoundId, slot: s, item_hash: hash,
            weapon_name: detail?.name ?? "", weapon_icon: detail?.icon ?? "",
            weapon_type: detail?.weaponType ?? "", damage_type: detail?.damageType ?? "",
            locked_by_user_id: currentUserId, created_at: now,
          });
        }
        seedSlots(seeded);
      } catch {
        hasSeeded.current = false;
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCaptain, roundId, intersection, equippedHashes, slotKey]);

  const handleToggleSpectate = useCallback(async () => {
    const next = !isSpectator;
    await fetch("/api/lobby/spectate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId: lobby.id, spectate: next }),
    });
  }, [lobby.id, isSpectator]);

  const handleLeave = useCallback(async () => {
    stopPolling();
    await fetch("/api/lobby/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId: lobby.id }),
    });
    router.push("/dashboard");
    router.refresh();
  }, [lobby.id, router, stopPolling]);

  const handleEndSession = useCallback(async () => {
    setShowEndSessionConfirm(false);
    stopPolling();
    await fetch("/api/lobby/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId: lobby.id }),
    });
    router.push("/dashboard");
    router.refresh();
  }, [lobby.id, router, stopPolling]);

  // Picking a character is all a player needs to do - it persists their
  // selection so post-match stats can be collected. No separate "ready" step.
  const handleSelectCharacter = useCallback(async (characterId: string) => {
    setSelectedCharId(characterId);
    const char = characters.find((c) => c.characterId === characterId);
    await fetch("/api/lobby/ready", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lobbyId: lobby.id,
        characterId,
        isReady: true,
        emblemPath: char?.emblemPath,
        emblemBackgroundPath: char?.emblemBackgroundPath,
      }),
    });
  }, [lobby.id, characters]);

  // Once characters load, ensure emblem paths are saved for the selected character.
  // We always fire once — using the existing selection if present, or picking the
  // most-recently-played guardian. This handles the case where a player had a
  // character selected before emblem paths were introduced (emblem_path would be
  // null without this re-send).
  useEffect(() => {
    if (hasAutoSelected.current || !characters.length) return;
    hasAutoSelected.current = true;
    const target = selectedCharId
      ?? [...characters].sort(
          (a, b) => new Date(b.dateLastPlayed).getTime() - new Date(a.dateLastPlayed).getTime()
        )[0]?.characterId;
    if (target) handleSelectCharacter(target);
  }, [characters, handleSelectCharacter, selectedCharId]);

  // Redirect all remaining members back to the dashboard when the leader ends
  // the session (lobby status flips to "done" via realtime).
  useEffect(() => {
    if (lobbyData.status === "done") {
      stopPolling();
      router.push("/dashboard");
      router.refresh();
    }
  }, [lobbyData.status, router, stopPolling]);

  void bungieMembershipType;
  void bungieMembershipId;

  const fetchLeaderboard = useCallback(async () => {
    setLeaderboardLoading(true);
    try {
      const res = await fetch("/api/stats/leaderboard");
      const data = await res.json();
      if (data.entries) setLeaderboard(data.entries);
    } catch { /* ignore */ }
    setLeaderboardLoading(false);
  }, []);

  useEffect(() => {
    if (statsTab === "leaderboard" && leaderboard === null) fetchLeaderboard();
  }, [statsTab, leaderboard, fetchLeaderboard]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (overflowMenuRef.current && !overflowMenuRef.current.contains(e.target as Node)) {
        setShowOverflowMenu(false);
      }
    }
    if (showOverflowMenu) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showOverflowMenu]);

  const handleToggleCaptainLock = useCallback(async () => {
    const next = !captainLocked;
    setCaptainLocked(next);
    await fetch("/api/lobby/captain-lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId: lobby.id, locked: next }),
    });
  }, [captainLocked, lobby.id]);
  void handleToggleCaptainLock; // wired up by the captain-lock control elsewhere in the tree

  const captainMember = members.find((m) => m.is_captain);
  const captainName = captainMember ? trimBungieName(captainMember.display_name) : null;
  void captainName; // surfaced via getLobbyStatusText / PlayerCard, kept for parity

  const rightColumn = (
    <LobbySidebar
      members={members}
      characters={characters}
      selectedCharId={selectedCharId}
      onSelectCharacter={handleSelectCharacter}
      contextExpanded={contextExpanded}
      onSetContextExpanded={setContextExpanded}
      isCaptain={isCaptain}
      isSpectator={isSpectator}
      intersection={intersection}
      effectiveIntersection={effectiveIntersection}
      weaponDetails={weaponDetails}
      instancePerks={instancePerks}
      collectionHashes={collectionHashes}
      weaponReleases={weaponReleases}
      intersectionError={intersectionError}
      intersectionAuthIssue={intersectionAuthIssue}
      currentUserId={currentUserId}
      reauthHref={reauthHref}
      poolLoading={poolLoading}
      actionDisabled={loadingAction !== null}
      currentHashes={Object.fromEntries(slots.filter((s) => s.item_hash !== 0).map((s) => [s.slot, s.item_hash]))}
      currentInstances={preferredInstances}
      favorites={favorites}
      onToggleFavorite={toggleFavorite}
      onSelectWeapon={handleSelectWeapon}
      onLoadIntersection={handleLoadIntersection}
      onHide={() => setRightOpen(false)}
    />
  );

  return (
    <div className="flex flex-col xl:flex-row gap-5 xl:items-start">
      <div className="flex-1 min-w-0 flex flex-col gap-6">
        {/* Header */}
        <div className="order-1 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={copyCode}
                aria-label="Copy lobby code"
                className="font-mono text-bungie-blue font-bold tracking-widest slashed-zero text-lg hover:opacity-75 transition inline-flex items-center gap-1.5"
              >
                {copied ? <Check size={18} /> : lobby.code}
              </button>
              <button
                onClick={copyLink}
                className="text-xs px-2 py-0.5 rounded border border-bungie-border/40 text-gray-400 hover:border-gray-500 transition inline-flex items-center gap-1"
              >
                {copiedLink ? <Check size={12} /> : <Copy size={12} />}
                {copiedLink ? "Copied" : "Invite"}
              </button>
              <button
                onClick={copyWatchLink}
                className="text-xs px-2 py-0.5 rounded border border-bungie-border/40 text-gray-400 hover:border-gray-500 transition inline-flex items-center gap-1"
              >
                {copiedWatch ? <Check size={12} /> : <Copy size={12} />}
                {copiedWatch ? "Copied" : "Watch"}
              </button>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {(() => {
                const { text, tone } = getLobbyStatusText(lobbyData.status, isCaptain, isSpectator);
                return (
                  <span className={`text-sm font-semibold px-2.5 py-1 rounded-lg border inline-flex items-center gap-1.5 ${STATUS_TONE_CLS[tone]}`}>
                    {tone === "turn" && <Crown size={13} />}
                    Round {lobbyData.current_round} · {text}
                  </span>
                );
              })()}
              {polling && <span className="text-xs text-green-500 animate-pulse">● watching</span>}
            </div>
            {minutesToClose !== null && minutesToClose <= 20 && (
              <div className={`inline-flex items-center gap-1.5 mt-1.5 text-xs px-2 py-0.5 rounded border ${
                minutesToClose <= 5
                  ? "border-red-600/50 bg-red-900/20 text-red-300"
                  : "border-yellow-600/40 bg-yellow-900/10 text-yellow-300"
              }`}>
                <Clock size={11} className="shrink-0" />
                {minutesToClose <= 1 ? "Closing due to inactivity…" : `Auto-closes in ${minutesToClose} min`}
              </div>
            )}
          </div>

          {/* Overflow menu */}
          <div ref={overflowMenuRef} className="relative">
            <button
              onClick={() => setShowOverflowMenu((v) => !v)}
              className="p-1.5 text-gray-400 border border-bungie-border/40 rounded-lg hover:border-gray-500 transition flex items-center"
              aria-label="More actions"
            >
              <MoreHorizontal size={16} />
            </button>
            {showOverflowMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-bungie-surface border border-bungie-border rounded-xl shadow-2xl overflow-hidden min-w-[160px]">
                {!isCaptain && (
                  <button
                    onClick={() => { handleToggleSpectate(); setShowOverflowMenu(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-bungie-dark transition"
                  >
                    {isSpectator ? "Rejoin" : "Spectate"}
                  </button>
                )}
                {isHost && (
                  <button
                    onClick={() => { setShowOverflowMenu(false); setShowEndSessionConfirm(true); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-bungie-dark transition"
                  >
                    End Session
                  </button>
                )}
                <button
                  onClick={() => { setShowOverflowMenu(false); handleLeave(); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-bungie-dark transition"
                >
                  Leave
                </button>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-500 hover:bg-bungie-dark transition border-t border-bungie-border/40"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>

          {showEndSessionConfirm && (
            <ConfirmDialog
              title="End this session?"
              body="This closes the lobby for everyone in the fireteam. Anyone still in it gets sent back to their dashboard."
              confirmLabel="End Session"
              tone="danger"
              onCancel={() => setShowEndSessionConfirm(false)}
              onConfirm={handleEndSession}
            />
          )}

          {pendingSpecialSelect && (
            <ConfirmDialog
              title="Select this weapon anyway?"
              body={`You already have ${pendingSpecialSelect.otherName} equipped as a Special weapon in the other slot. Picking this one too means no Primary in the loadout.`}
              confirmLabel="Select Anyway"
              onCancel={() => setPendingSpecialSelect(null)}
              onConfirm={() => {
                const { slot, hash, instanceId } = pendingSpecialSelect;
                setPendingSpecialSelect(null);
                handleSelectWeapon(slot, hash, instanceId);
              }}
            />
          )}
        </div>

        {/* Stats panel: Session / History / Leaderboard tabs */}
        <div className="order-6">
          <LobbyStatsPanel
            statsTab={statsTab}
            onTabChange={setStatsTab}
            sessionTotals={sessionTotals}
            roundHistory={roundHistory}
            expandedRound={expandedRound}
            onExpandRound={setExpandedRound}
            leaderboard={leaderboard}
            leaderboardLoading={leaderboardLoading}
            lastGameStats={lastGameStats}
            onDismissLastGame={() => setLastGameStats(null)}
          />
        </div>

        {/* Loadout panel — rows + primary actions in the header. */}
        {(slots.length > 0 || (roundId && !isSpectator)) && (
          <div className={`order-2 relative transition-all duration-500 ${loadingAction === "roll" ? "after:absolute after:inset-0 after:rounded-xl after:bg-bungie-blue/5 after:pointer-events-none" : ""}`}>
            <LoadoutQueue
              slots={slots}
              weaponDetails={weaponDetails}
              instancePerks={instancePerks}
              collectionHashes={collectionHashes}
              animKindRef={animKindRef}
              isCaptain={isCaptain}
              lockedSlots={lockedSlots}
              wildcardSlots={wildcardSlots}
              onCycleSlotMode={cycleSlotMode}
              onRerollSlot={(slot) => handleRoll(slot)}
              rerollExhausted={rerollExhausted}
              actions={
                !isSpectator && roundId ? (
                  <>
                    {isCaptain && (
                      <button
                        onClick={() => handleRoll()}
                        disabled={Boolean(rollDisabledReason)}
                        title={rollDisabledReason ?? "Roll all slots"}
                        className="px-4 py-1.5 bg-bungie-blue hover:opacity-90 disabled:opacity-40 text-white font-semibold rounded-full transition text-sm inline-flex items-center gap-2"
                        aria-label="Roll all slots"
                      >
                        {loadingAction === "roll" ? <Spinner size={15} /> : <Shuffle size={15} />}
                        {loadingAction === "roll" ? "Rolling…" : "Roll Loadout"}
                      </button>
                    )}
                    {hasRolledLoadout && (
                      <button
                        onClick={handleApply}
                        disabled={Boolean(applyDisabledReason)}
                        title={applyDisabledReason ?? "Apply this loadout"}
                        className="px-4 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white font-semibold rounded-full transition text-sm inline-flex items-center gap-2"
                        aria-label="Apply loadout"
                      >
                        {loadingAction === "apply" ? <Spinner size={15} /> : <Zap size={15} />}
                        {loadingAction === "apply" ? "Applying…" : "Apply Loadout"}
                      </button>
                    )}
                    {loadingAction === "apply" && (
                      <button
                        onClick={handleCancelApply}
                        className="px-3 py-1.5 border border-red-800 text-red-400 hover:border-red-600 rounded-full text-sm transition"
                      >
                        Cancel
                      </button>
                    )}
                  </>
                ) : null
              }
            />
          </div>
        )}

        {/* Status line below the loadout: warnings and auto-apply toggle. */}
        {!isSpectator && roundId && (
          <div className="order-3 flex items-center gap-3 flex-wrap min-h-[1.25rem] px-1">
            {hasRolledLoadout && applyDisabledReason && loadingAction !== "apply" && (
              <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 text-xs text-yellow-300">
                {applyDisabledReason}
              </span>
            )}
            {isCaptain && rollDisabledReason && !hasRolledLoadout && loadingAction !== "roll" && (
              <span className="rounded-full border border-bungie-border bg-bungie-surface px-2 py-1 text-xs text-gray-400">
                {rollDisabledReason}
              </span>
            )}
            {intersectionError && (
              <span className="rounded-lg border border-red-500/25 bg-red-500/10 px-2 py-1.5 text-xs leading-5 text-red-200">
                {currentUserNeedsReauth
                  ? "Your Bungie sign-in needs a refresh before shared weapons can load."
                  : intersectionAuthIssue?.failedDisplayNames?.length
                    ? `${intersectionAuthIssue.failedDisplayNames.join(", ")} needs to refresh Bungie sign-in.`
                    : intersectionError}
                {currentUserNeedsReauth && (
                  <a href={reauthHref} className="ml-2 font-semibold text-bungie-blue hover:text-sky-300">
                    Sign in again
                  </a>
                )}
              </span>
            )}
            {!intersection && isCaptain && loadingAction === "intersection" && (
              <span className="text-xs text-gray-500 inline-flex items-center gap-1.5">
                <Spinner size={12} />
                Loading shared weapons…
              </span>
            )}
            {/* Auto-apply toggle — non-captains opt in to apply when the captain clicks Apply */}
            {!isCaptain && (
              <label className="ml-auto flex items-center gap-2 cursor-pointer select-none group">
                <span className={`text-xs transition-colors ${autoApply ? "text-green-400" : "text-gray-500 group-hover:text-gray-300"}`}>
                  Auto-apply
                </span>
                <button
                  role="switch"
                  aria-checked={autoApply}
                  onClick={toggleAutoApply}
                  className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors duration-200 focus:outline-none ${
                    autoApply
                      ? "bg-green-700 border-green-600"
                      : "bg-bungie-surface border-bungie-border group-hover:border-gray-500"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      autoApply ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </label>
            )}
          </div>
        )}

        {hasRolledLoadout && (
          <div className="order-4">
          <RollDetails
            rolls={rollsData}
            chosenInstances={myChosenInstances}
            onChooseInstance={handleChooseInstance}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            memberCards={Object.fromEntries(members.map((m) => [m.user_id, m]))}
            loading={rollsLoading}
            error={rollsError}
            onRetry={fetchRolls}
          />
          </div>
        )}

        {applyResults.length > 0 && (
          <div className="order-5">
          <ApplyStatus results={applyResults} onClear={clearApplyResults} />
          </div>
        )}
      </div>

      {rightOpen ? rightColumn : (
        <button
          onClick={() => setRightOpen(true)}
          aria-label="Show panel"
          className="shrink-0 xl:sticky xl:top-6 flex xl:flex-col items-center justify-center gap-2 rounded-xl border border-bungie-border/40 bg-bungie-surface text-gray-400 hover:text-gray-200 hover:border-gray-500 transition w-full xl:w-10 px-3 py-2 xl:py-4"
        >
          <PanelRightOpen size={16} />
          <span className="text-xs xl:hidden">Show fireteam &amp; weapon pool</span>
        </button>
      )}
    </div>
  );
}
