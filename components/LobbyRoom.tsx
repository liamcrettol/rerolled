"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Lobby, LobbyMember } from "@/types/lobby";
import type { DestinyCharacter, WeaponSlot } from "@/types/bungie";
import LoadoutQueue from "./LoadoutQueue";
import ApplyStatus from "./ApplyStatus";
import { signOut } from "next-auth/react";
import RollDetails from "./RollDetails";
import { trimBungieName } from "@/lib/utils";
import { useGameDetection } from "@/hooks/useGameDetection";
import Spinner from "./Spinner";
import ConfirmDialog from "./lobby/ConfirmDialog";
import LobbySidebar from "./lobby/LobbySidebar";
import { wildcardsFromSlots } from "@/lib/lobby/realtimeState";
import { useLobbySession } from "@/hooks/lobby/useLobbySession";
import { useRollState } from "@/hooks/lobby/useRollState";
import { useWeaponPool } from "@/hooks/lobby/useWeaponPool";
import { useRollInstances } from "@/hooks/lobby/useRollInstances";
import { useApplyLoadout } from "@/hooks/lobby/useApplyLoadout";
import { useRollActions } from "@/hooks/lobby/useRollActions";
import { Shuffle, Crown, Check, Copy, X, MoreHorizontal, Clock, Lock, Link2, Eye, ChevronDown } from "lucide-react";
import MidaWordmark from "./MidaWordmark";
import ThemeToggle from "./ThemeToggle";
import type { SlotPerk } from "./LoadoutQueue";
import { SLOT_ORDER, SLOT_LABELS } from "@/lib/destiny/constants";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { useCharacters } from "@/hooks/useCharacters";

interface Props {
  lobby: Lobby;
  initialMembers: LobbyMember[];
  currentUserId: string;
  currentUserDisplayName: string;
  bungieMembershipType: number;
  bungieMembershipId: string;
}

const EMPTY_CHARACTERS: DestinyCharacter[] = [];

// Stats the stage uses for its one-line "your copy vs theirs" note.
const COMPARE_STATS = ["Range", "Stability", "Handling", "Reload"];

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
        : { text: "Loadout ready | waiting on the captain to apply", tone: "info" };
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
  const { characters: loadedCharacters } = useCharacters({ selectFirst: false });
  const characters = loadedCharacters ?? EMPTY_CHARACTERS;
  // Pre-select the guardian this player already chose (persists across rounds/rejoins).
  const [selectedCharId, setSelectedCharId] = useState<string | null>(
    initialMembers.find((m) => m.user_id === currentUserId)?.selected_character_id ?? null
  );
  const [contextExpanded, setContextExpanded] = useState(true);

  const [preferredInstances, setPreferredInstancesState] = useState<Partial<Record<WeaponSlot, string>>>({});
  const { copy, isCopied } = useCopyToClipboard();
  const copied = isCopied("code");
  const copiedLink = isCopied("invite");
  const copiedWatch = isCopied("watch");
  const hasAutoSelected = useRef(false);

  // Match-detection polling still runs in the background (it's also the
  // fallback that rotates the captain if a game finishes without everyone
  // explicitly applying) - Rerolled just no longer displays the session/match
  // history it used to show, now that Rival is the source of truth for that.
  const { startPolling, stopPolling } = useGameDetection({
    lobbyId: lobby.id,
    // lobbyData.status isn't known until useLobbySession runs below; the
    // initial `lobby` prop is an acceptable seed since realtime immediately
    // syncs it and this hook re-subscribes on lobbyId, not status.
    status: lobby.status,
  });
  // Captain-only toggles
  const [captainLocked, setCaptainLocked] = useState(lobby.captain_locked ?? false);
  // The shared pool opens as a drawer instead of a permanent column.
  const [rightOpen, setRightOpen] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  // Lets anyone peek at the full loadout stage while the round is in game.
  const [showStage, setShowStage] = useState(false);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [showCaptainPicker, setShowCaptainPicker] = useState(false);
  const [passingCaptaincy, setPassingCaptaincy] = useState(false);
  const [captainPassError, setCaptainPassError] = useState<string | null>(null);
  const [showEndSessionConfirm, setShowEndSessionConfirm] = useState(false);
  const [endSessionError, setEndSessionError] = useState<string | null>(null);
  const [endingSession, setEndingSession] = useState(false);
  // Confirmation for picking a second Special-ammo weapon into kinetic+energy
  // (leaves no Primary in the loadout) - styled like the End Session dialog
  // instead of a native browser confirm() (#187).
  const [pendingSpecialSelect, setPendingSpecialSelect] = useState<{
    slot: WeaponSlot; hash: number; instanceId?: string; otherName: string;
  } | null>(null);
  const [minutesToClose, setMinutesToClose] = useState<number | null>(null);
  const overflowMenuRef = useRef<HTMLDivElement>(null);
  // Brief pulse on the status badge for everyone but the captain, fired the
  // instant the captain broadcasts Apply - real feedback that the loadout was
  // selected, independent of the "applying" lobby status (which nothing ever
  // sets; apply jumps straight from "rolling" to "in_game").
  const [captainApplyPulse, setCaptainApplyPulse] = useState(false);
  const captainApplyPulseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (captainApplyPulseTimeoutRef.current) clearTimeout(captainApplyPulseTimeoutRef.current);
  }, []);

  // State (not a ref) so the join-refresh and auth-retry effects below can
  // actually depend on it and re-run the moment this client's own initial
  // load finishes, instead of only reacting when members/roundId happen to
  // change again for an unrelated reason (#309 follow-up).
  const [hasAutoLoaded, setHasAutoLoaded] = useState(false);
  const hasSeeded = useRef(false);
  const prevMemberCount = useRef<number | null>(null);

  // Mirrors of values the realtime broadcast handler needs but that are
  // themselves derived from useLobbySession's own return value below — can't
  // be closed over directly without a circular hook call, so they're kept one
  // render behind via ref (same pattern the pre-#224 code used).
  const isCaptainRef = useRef(false);
  const isSpectatorRef = useRef(false);
  // autoApply itself isn't declared until useApplyLoadout runs below, so the
  // broadcast handler (built here, before that hook is called) closes over
  // whatever value existed at that render - never the live one. Mirror it
  // through a ref like isCaptainRef/isSpectatorRef so toggling the checkbox
  // is actually seen the next time the captain's apply broadcast arrives.
  const autoApplyRef = useRef(false);

  const {
    rollMode, setRollMode, bannedTypes, setBannedTypes,
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
          setHasAutoLoaded(false);
          hasSeeded.current = false;
        },
        onCaptainApply: () => {
          if (!isCaptainRef.current) {
            setCaptainApplyPulse(true);
            if (captainApplyPulseTimeoutRef.current) clearTimeout(captainApplyPulseTimeoutRef.current);
            captainApplyPulseTimeoutRef.current = setTimeout(() => setCaptainApplyPulse(false), 2500);
          }
          if (!autoApplyRef.current || isSpectatorRef.current || isCaptainRef.current) return;
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
  useEffect(() => { autoApplyRef.current = autoApply; }, [autoApply]);

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
    rerollExhausted,
    noteRerollUsed,
    lockedSlots,
    setLockedSlots,
    wildcardSlots,
    setWildcardSlots,
    recentRollsRef,
    animKindRef,
    setPreferredInstances: setPreferredInstancesState,
    dismissLastGame: () => {},
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

  const copyCode = useCallback(async () => {
    await copy(lobby.code, "code");
  }, [copy, lobby.code]);

  const copyLink = useCallback(async () => {
    await copy(`${window.location.origin}/join/${lobby.code}`, "invite");
  }, [copy, lobby.code]);

  const copyWatchLink = useCallback(async () => {
    await copy(`${window.location.origin}/watch/${lobby.code}`, "watch");
  }, [copy, lobby.code]);

  const handleLoadIntersection = useCallback(
    () => loadIntersection(selectedCharId),
    [loadIntersection, selectedCharId]
  );

  // Auto-load the shared pool for any participant (not just the captain) once
  // the round is ready, so a joining member doesn't have to click "Load Shared
  // Weapons" themselves. The captain's load also seeds the initial roll;
  // non-captains just populate their pool view.
  useEffect(() => {
    if (hasAutoLoaded) return;
    if (isSpectator || !roundId) return;
    setHasAutoLoaded(true);
    handleLoadIntersection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpectator, roundId, hasAutoLoaded]);

  // When a new non-spectator joins, refresh the pool for everyone already
  // loaded — without re-rolling — so the captain's pool reflects the new member
  // without a manual reload. Skipped during an active game.
  //
  // Guards against a join racing this client's OWN initial auto-load (#309):
  // if a join lands before hasAutoLoaded flips true, the baseline isn't
  // advanced past the increase, so the join isn't silently absorbed. Since
  // hasAutoLoaded is now real state (not a ref) and a dependency here, this
  // effect actually re-runs the moment this client's own load completes
  // (rather than only when members/roundId happen to change again for an
  // unrelated reason), catching up on any joins that raced it.
  useEffect(() => {
    const count = members.filter((m) => !m.is_spectator).length;
    if (prevMemberCount.current === null) { prevMemberCount.current = count; return; }
    const prev = prevMemberCount.current;
    if (count <= prev) { prevMemberCount.current = count; return; }
    if (!hasAutoLoaded) return;
    prevMemberCount.current = count;
    if (lobbyData.status === "in_game") return;
    handleLoadIntersection();
    // Refresh the comparison so the new member's rolls appear without waiting
    // for a slot change (fetchRolls otherwise only re-runs on slot changes).
    if (slots.some((s) => s.item_hash !== 0)) fetchRolls();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, lobbyData.status, roundId, hasAutoLoaded]);

  // If an inventory load failed because someone's Bungie auth needs refreshing,
  // a successful reauth touches that member row and arrives here as realtime.
  // Retry for everyone automatically instead of requiring browser refreshes.
  useEffect(() => {
    if (!intersectionAuthIssue || poolLoading || isSpectator) return;
    if (!hasAutoLoaded) return;
    if (lobbyData.status === "in_game") return;
    handleLoadIntersection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, hasAutoLoaded]);

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
    setEndSessionError(null);
    setEndingSession(true);
    try {
      const res = await fetch("/api/lobby/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobbyId: lobby.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Couldn't end the session. Try again.");
      }
      stopPolling();
      setShowEndSessionConfirm(false);
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setEndSessionError(e instanceof Error ? e.message : "Couldn't end the session. Try again.");
    } finally {
      setEndingSession(false);
    }
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

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (overflowMenuRef.current && !overflowMenuRef.current.contains(e.target as Node)) {
        setShowOverflowMenu(false);
      }
    }
    if (showOverflowMenu) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showOverflowMenu]);

  const captainPickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (captainPickerRef.current && !captainPickerRef.current.contains(e.target as Node)) {
        setShowCaptainPicker(false);
        setCaptainPassError(null);
      }
    }
    if (showCaptainPicker) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showCaptainPicker]);

  // Captaincy can move to someone else at any time (rotation, another client's
  // hand-off). Close a picker that is no longer this user's to act on.
  useEffect(() => {
    if (!isCaptain) {
      setShowCaptainPicker(false);
      setCaptainPassError(null);
    }
  }, [isCaptain]);

  const handleToggleCaptainLock = useCallback(async () => {
    const next = !captainLocked;
    setCaptainLocked(next);
    await fetch("/api/lobby/captain-lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId: lobby.id, locked: next }),
    });
  }, [captainLocked, lobby.id]);

  // Hand captaincy to a specific player. The realtime lobby_members UPDATE is
  // what actually moves the crown for everyone (including this client), so
  // there is no local optimistic flip to unwind if the request fails.
  const handlePassCaptaincy = useCallback(
    async (userId: string) => {
      setPassingCaptaincy(true);
      setCaptainPassError(null);
      try {
        const res = await fetch("/api/lobby/set-captain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lobbyId: lobby.id, userId }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setCaptainPassError(body.error ?? "Could not pass captaincy. Try again.");
          return;
        }
        setShowCaptainPicker(false);
      } catch {
        setCaptainPassError("Could not reach the server. Try again.");
      } finally {
        setPassingCaptaincy(false);
      }
    },
    [lobby.id]
  );

  // Eligible recipients: everyone actually playing except the current captain.
  const captainCandidates = members.filter(
    (m) => !m.is_spectator && m.user_id !== currentUserId
  );

  const captainMember = members.find((m) => m.is_captain);
  const captainName = captainMember ? trimBungieName(captainMember.display_name) : null;

  const sidebarProps = {
    members,
    characters,
    selectedCharId,
    onSelectCharacter: handleSelectCharacter,
    contextExpanded,
    onSetContextExpanded: setContextExpanded,
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
    actionDisabled: loadingAction !== null,
    currentHashes: Object.fromEntries(slots.filter((s) => s.item_hash !== 0).map((s) => [s.slot, s.item_hash])),
    currentInstances: preferredInstances,
    favorites,
    onToggleFavorite: toggleFavorite,
    onSelectWeapon: handleSelectWeapon,
    onLoadIntersection: handleLoadIntersection,
    onHide: () => setRightOpen(false),
    showMetaFilter: rollMode !== "meta",
  };

  // Your copy of each loadout weapon (its perks) and one plain line on how it
  // stacks up against the fireteam's copies. The full comparison lives behind
  // "Compare rolls" so the stage stays about the three guns.
  const { slotPerks, slotNotes } = useMemo(() => {
    const perks: Partial<Record<WeaponSlot, SlotPerk[]>> = {};
    const notes: Partial<Record<WeaponSlot, string>> = {};
    for (const s of SLOT_ORDER) {
      const sr = rollsData[s];
      if (!sr) continue;
      const me = sr.members.find((m) => m.isMe);
      const mine = me?.instances.find((i) => i.instanceId === myChosenInstances[s]) ?? me?.instances[0];
      if (!mine) {
        if (me) notes[s] = "You do not own a copy yet.";
        continue;
      }
      perks[s] = mine.perkHashes
        .map((h, i) => ({ name: mine.perks[i]?.name ?? "", icon: mine.perkIcons[h] }))
        .filter((p) => p.name);
      let best: { who: string; stat: string; diff: number } | null = null;
      for (const m of sr.members) {
        if (m.isMe || !m.instances[0]) continue;
        for (const st of COMPARE_STATS) {
          const diff = (m.instances[0].stats[st] ?? 0) - (mine.stats[st] ?? 0);
          if (diff >= 3 && (!best || diff > best.diff)) best = { who: trimBungieName(m.displayName), stat: st, diff };
        }
      }
      if (best) notes[s] = `${best.who} has a copy with more ${best.stat.toLowerCase()}.`;
      else if (sr.members.length > 1) notes[s] = "Your copy is the fireteam best.";
    }
    return { slotPerks: perks, slotNotes: notes };
  }, [rollsData, myChosenInstances]);

  const status = getLobbyStatusText(lobbyData.status, isCaptain, isSpectator);
  const lockedIn = lobbyData.status === "in_game" && hasRolledLoadout && !showStage;
  const rerollsLeft = rerollLimit !== null ? Math.max(0, rerollLimit - rerollsUsed) : null;
  const activeMembers = members.filter((m) => !m.is_spectator);
  const poolCount = effectiveIntersection
    ? effectiveIntersection.kinetic.length + effectiveIntersection.energy.length + effectiveIntersection.power.length
    : null;
  const myResult = (slot: string) =>
    applyResults.find((r) => r.kind !== "vault" && r.slot === slot && r.user_id === currentUserId);
  const iApplied = Boolean(myResult("kinetic") || myResult("energy") || myResult("power"));

  return (
    <div className="flex min-h-screen flex-col pb-28">
      {/* Lobby bar */}
      <header className="flex min-h-16 flex-wrap items-center gap-x-6 gap-y-2 border-b border-bungie-border px-4 py-3 sm:px-8">
        <MidaWordmark tool="rerolled" href="/dashboard" />
        <button
          type="button"
          onClick={copyCode}
          aria-label="Copy lobby code"
          className="inline-flex h-9 items-center gap-2.5 border border-white/15 px-3 transition-colors hover:border-white/30"
        >
          <span className="tabular-nums text-[15px]  slashed-zero">{lobby.code}</span>
          {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} className="text-gray-400" />}
        </button>
        <span className="text-sm text-gray-400">Round {lobbyData.current_round}</span>
        {minutesToClose !== null && minutesToClose <= 20 && (
          <span className={`inline-flex items-center gap-1.5 text-xs ${minutesToClose <= 5 ? "text-red-300" : "text-yellow-300"}`}>
            <Clock size={12} />
            {minutesToClose <= 1 ? "Closing for inactivity" : `Closes in ${minutesToClose} min`}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <button type="button" onClick={copyLink} className="inline-flex h-9 items-center gap-1.5 border border-white/15 px-3 text-sm font-semibold transition-colors hover:border-white/30">
            {copiedLink ? <Check size={14} /> : <Link2 size={14} />} {copiedLink ? "Copied" : "Invite"}
          </button>
          <button type="button" onClick={copyWatchLink} className="hidden h-9 items-center gap-1.5 border border-white/15 px-3 text-sm font-semibold text-gray-300 transition-colors hover:border-white/30 sm:inline-flex">
            {copiedWatch ? <Check size={14} /> : <Eye size={14} />} {copiedWatch ? "Copied" : "Watch link"}
          </button>
          <div ref={overflowMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setShowOverflowMenu((v) => !v)}
              className="grid h-9 w-9 place-items-center border border-white/15 text-gray-300 transition-colors hover:border-white/30"
              aria-label="More actions"
              aria-expanded={showOverflowMenu}
            >
              <MoreHorizontal size={16} />
            </button>
            {showOverflowMenu && (
              <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] overflow-hidden border border-bungie-border bg-bungie-surface ">
                {!isCaptain && (
                  <button
                    onClick={() => { handleToggleSpectate(); setShowOverflowMenu(false); }}
                    className="w-full px-4 py-2.5 text-left text-sm text-gray-300 transition hover:bg-bungie-dark"
                  >
                    {isSpectator ? "Rejoin" : "Spectate"}
                  </button>
                )}
                {isHost && (
                  <button
                    onClick={() => { setShowOverflowMenu(false); setEndSessionError(null); setShowEndSessionConfirm(true); }}
                    className="w-full px-4 py-2.5 text-left text-sm text-red-400 transition hover:bg-bungie-dark"
                  >
                    End session
                  </button>
                )}
                <button
                  onClick={() => { setShowOverflowMenu(false); handleLeave(); }}
                  className="w-full px-4 py-2.5 text-left text-sm text-red-400 transition hover:bg-bungie-dark"
                >
                  Leave
                </button>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="w-full border-t border-bungie-border px-4 py-2.5 text-left text-sm text-gray-500 transition hover:bg-bungie-dark"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>

        {showEndSessionConfirm && (
          <ConfirmDialog
            title="End this session?"
            body="Closes the lobby for everyone."
            confirmLabel="End Session"
            tone="danger"
            onCancel={() => { setShowEndSessionConfirm(false); setEndSessionError(null); }}
            onConfirm={handleEndSession}
            error={endSessionError}
            confirming={endingSession}
          />
        )}
        {pendingSpecialSelect && (
          <ConfirmDialog
            title="Select this weapon anyway?"
            body={`${pendingSpecialSelect.otherName} is already Special. This leaves no Primary in the loadout.`}
            confirmLabel="Select Anyway"
            onCancel={() => setPendingSpecialSelect(null)}
            onConfirm={() => {
              const { slot, hash, instanceId } = pendingSpecialSelect;
              setPendingSpecialSelect(null);
              handleSelectWeapon(slot, hash, instanceId);
            }}
          />
        )}
      </header>

      <div className="flex flex-1 flex-wrap">
        {/* Fireteam rail */}
        <aside aria-label="Fireteam" className="flex min-w-0 flex-[1_1_260px] flex-col gap-4 border-b border-bungie-border px-4 py-6 sm:px-6 lg:max-w-[300px] lg:border-b-0 lg:border-r">
          <LobbySidebar {...sidebarProps} section="fireteam" contextExpanded onSetContextExpanded={() => {}} />
          {!isSpectator && (
            <div className="mt-auto flex flex-col gap-1.5 border-t border-bungie-border pt-5">
              <span className="text-[13px] text-gray-500">Rolling from</span>
              <span className="text-[28px] font-semibold leading-none tabular-nums">
                {poolLoading && poolCount === null ? <Spinner size={18} /> : poolCount !== null ? `${poolCount} guns` : "No pool yet"}
              </span>
              <span className="text-[13px] text-gray-400">
                {activeMembers.length > 1 ? `that all ${activeMembers.length} of you own` : "you own"}
              </span>
              <button
                type="button"
                onClick={() => setRightOpen(true)}
                className="mt-2 self-start text-sm font-semibold text-gray-100 underline decoration-white/25 underline-offset-4 transition-colors hover:decoration-white"
              >
                {isCaptain ? "Browse and pick from the pool" : "Browse the pool"}
              </button>
            </div>
          )}
        </aside>

        {/* Stage */}
        <main className="flex min-w-0 flex-[999_1_640px] flex-col">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 pt-6 sm:px-10">
            <h1 className="section-label">Round {lobbyData.current_round} loadout</h1>
            <div className="flex flex-wrap items-center gap-3">
              {rerollsLeft !== null && !lockedIn && (
                <span className="flex items-center gap-2.5 text-sm text-gray-400">
                  {rerollsLeft} {rerollsLeft === 1 ? "reroll" : "rerolls"} left
                  <span className="flex gap-1" aria-hidden="true">
                    {Array.from({ length: Math.min(rerollLimit ?? 0, 10) }).map((_, i) => (
                      <span key={i} className={`h-1.5 w-5 ${i < rerollsLeft ? "bg-bungie-blue" : "bg-white/15"}`} />
                    ))}
                  </span>
                </span>
              )}
              {isCaptain && captainCandidates.length > 0 && (
                <div className="relative" ref={captainPickerRef}>
                  <button
                    type="button"
                    onClick={() => { setShowCaptainPicker((v) => !v); setCaptainPassError(null); }}
                    aria-haspopup="menu"
                    aria-expanded={showCaptainPicker}
                    className="inline-flex h-8 items-center gap-1.5 border border-white/15 px-2.5 text-xs font-semibold text-gray-400 transition-colors hover:border-white/30 hover:text-gray-100"
                  >
                    <Crown size={12} /> Pass captain
                  </button>
                  {showCaptainPicker && (
                    <div role="menu" className="absolute right-0 top-full z-50 mt-1 min-w-[180px] overflow-hidden border border-bungie-border bg-bungie-surface ">
                      {captainPassError && <p className="border-b border-bungie-border px-4 py-2 text-xs text-red-400">{captainPassError}</p>}
                      {captainCandidates.map((m) => (
                        <button
                          key={m.user_id}
                          role="menuitem"
                          disabled={passingCaptaincy}
                          onClick={() => handlePassCaptaincy(m.user_id)}
                          className="w-full px-4 py-2.5 text-left text-sm text-gray-300 transition hover:bg-bungie-dark disabled:opacity-50"
                        >
                          {trimBungieName(m.display_name)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {isCaptain && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={captainLocked}
                  onClick={handleToggleCaptainLock}
                  title={captainLocked ? "Captain rotation is paused. Click to rotate again after each round." : "Captain rotates to the next player each round. Click to stay captain."}
                  className={`inline-flex h-8 items-center gap-1.5 border px-2.5 text-xs font-semibold transition-colors ${
                    captainLocked ? "border-bungie-blue bg-bungie-blue text-bungie-dark" : "border-white/15 text-gray-400 hover:border-white/30 hover:text-gray-100"
                  }`}
                >
                  <Lock size={12} /> {captainLocked ? "Staying captain" : "Stay captain"}
                </button>
              )}
            </div>
          </div>

          {lockedIn ? (
            <section aria-label="Loadout locked in" className="flex flex-1 flex-col items-center gap-9 px-4 py-14 text-center">
              <div className="flex flex-col items-center gap-3">
                <span className="inline-flex items-center gap-2 text-[13px] font-bold   text-green-400">
                  <Check size={16} strokeWidth={3} /> {isCaptain ? "Applied" : "Captain applied"}
                </span>
                <h2 className="font-wide text-[44px]  leading-[0.95] sm:text-[60px]">Loadout locked in</h2>
                <p className="max-w-[46ch] text-[17px] leading-relaxed text-gray-400">
                  {isCaptain
                    ? "Load into your match. Rerolled picks up the result when it ends."
                    : `${captainName ?? "The captain"} applied it. ${iApplied ? "It is on your Guardian now." : "Apply it to put it on your Guardian."}`}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-8">
                {SLOT_ORDER.map((s) => {
                  const slot = slots.find((x) => x.slot === s);
                  if (!slot || slot.item_hash === 0) {
                    return (
                      <figure key={s} className="flex w-40 flex-col items-center gap-3">
                        <div className="grid h-32 w-32 place-items-center bg-[#16181c] text-sm text-gray-500 ">{SLOT_LABELS[s]}</div>
                        <figcaption className="text-sm text-gray-400">Your own</figcaption>
                      </figure>
                    );
                  }
                  const r = myResult(s);
                  const exotic = (weaponDetails[slot.item_hash]?.tierType ?? 5) === 6;
                  return (
                    <figure key={s} className="flex w-40 flex-col items-center gap-3">
                      <div className="relative h-32 w-32 overflow-hidden bg-[#16181c] ">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={slot.weapon_icon} alt="" className="absolute inset-0 h-full w-full" />
                        {weaponDetails[slot.item_hash]?.watermark && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={weaponDetails[slot.item_hash]!.watermark} alt="" className="absolute inset-0 h-full w-full" />
                        )}
                        <span className="absolute inset-x-0 bottom-0 h-1" style={{ background: exotic ? "#ceae33" : "#8a57a8" }} aria-hidden="true" />
                      </div>
                      <figcaption className="flex flex-col gap-1">
                        <span className="font-wide text-lg font-bold">{slot.weapon_name}</span>
                        <span className={`text-[13px] ${r ? (r.success ? "text-green-400" : "text-red-300") : "text-gray-400"}`}>
                          {r ? (r.success ? "Equipped" : r.error ?? "Did not equip") : "Not applied yet"}
                        </span>
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
              <ul aria-label="Fireteam progress" className="w-full max-w-[520px] border-t border-bungie-border text-left">
                {activeMembers.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 border-b border-bungie-border py-3.5">
                    <span className="flex-1 truncate font-semibold">{m.user_id === currentUserId ? "You" : trimBungieName(m.display_name)}</span>
                    <span className={`text-sm ${m.is_ready ? "text-green-400" : "text-gray-400"}`}>{m.is_ready ? "Applied" : "Waiting"}</span>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setShowStage(true)} className="text-sm font-semibold text-gray-300 underline decoration-white/25 underline-offset-4 hover:decoration-white">
                Show the loadout
              </button>
            </section>
          ) : (
            <div className={`relative px-4 pb-6 pt-2 sm:px-10 ${loadingAction === "roll" ? "pointer-events-none" : ""}`}>
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
                slotPerks={slotPerks}
                slotNotes={slotNotes}
              />
            </div>
          )}

          {intersectionError && (
            <p className="mx-4 mb-4 border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-200 sm:mx-10">
              {currentUserNeedsReauth
                ? "Your Bungie sign-in expired."
                : intersectionAuthIssue?.failedDisplayNames?.length
                  ? `Waiting on ${intersectionAuthIssue.failedDisplayNames.join(", ")} to sign in again.`
                  : intersectionError}
              {currentUserNeedsReauth && (
                <a href={reauthHref} className="ml-2 font-semibold text-white underline underline-offset-4">Sign in again</a>
              )}
            </p>
          )}

          {hasRolledLoadout && !lockedIn && (
            <div className="border-t border-bungie-border px-4 py-4 sm:px-10">
              <button
                type="button"
                aria-expanded={showCompare}
                onClick={() => setShowCompare((v) => !v)}
                className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-gray-300 transition-colors hover:text-white"
              >
                <ChevronDown size={16} className={`transition-transform ${showCompare ? "rotate-180" : ""}`} />
                {showCompare ? "Hide roll comparison" : "Compare rolls and pick your copy"}
              </button>
              {showCompare && (
                <div className="mt-4">
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
            </div>
          )}

          {applyResults.length > 0 && (
            <div className="px-4 pb-6 sm:px-10">
              <ApplyStatus results={applyResults} onClear={clearApplyResults} />
            </div>
          )}
        </main>
      </div>

      {/* Pool drawer */}
      {rightOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setRightOpen(false)}>
          <aside
            aria-label="Shared pool"
            className="flex h-full w-full max-w-[460px] flex-col border-l border-bungie-border bg-bungie-surface"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-bungie-border px-5 py-4">
              <div>
                <h2 className="font-wide text-[17px] font-bold">Shared pool</h2>
                <p className="mt-0.5 text-[13px] text-gray-400">{isCaptain ? "Pick a gun to put it in the loadout." : "The captain picks from here."}</p>
              </div>
              <button type="button" onClick={() => setRightOpen(false)} aria-label="Close the pool" className="grid h-10 w-10 place-items-center border border-white/15 hover:border-white/30">
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <LobbySidebar {...sidebarProps} section="pool" />
            </div>
          </aside>
        </div>
      )}

      {/* Action bar */}
      {!isSpectator && roundId && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/15 bg-[#0e0f12]">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-8">
            <div className="min-w-0 flex-[1_1_280px]">
              <p className="text-[15px] text-gray-400">
                <span className="font-semibold text-gray-100">{isCaptain ? "You are captain." : `${captainName ?? "The captain"} is captain.`}</span>{" "}
                {captainApplyPulse && !isCaptain ? "They just applied the loadout." : lockedIn ? (isCaptain ? "Good luck out there." : "Your loadout follows theirs.") : status.text}
                {hasRolledLoadout && applyDisabledReason && loadingAction !== "apply" && !lockedIn && (
                  <span className="ml-2 text-yellow-300">{applyDisabledReason}.</span>
                )}
              </p>
            </div>
            {!isCaptain && (
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-gray-300">
                <input type="checkbox" checked={autoApply} onChange={toggleAutoApply} className="h-[18px] w-[18px] accent-white" />
                Apply automatically when the captain applies
              </label>
            )}
            {isCaptain && !lockedIn && (
              <button
                type="button"
                onClick={() => handleRoll()}
                disabled={Boolean(rollDisabledReason)}
                title={rollDisabledReason ?? "Roll all slots"}
                className="inline-flex h-14 items-center gap-2 border border-white/25 px-6 text-[15px] font-semibold transition-colors hover:border-white/40 hover:bg-white/5 disabled:opacity-40"
              >
                {loadingAction === "roll" ? <Spinner size={16} /> : <Shuffle size={16} />}
                {loadingAction === "roll" ? "Rolling" : hasRolledLoadout ? "Roll all" : "Roll loadout"}
              </button>
            )}
            {hasRolledLoadout && loadingAction === "apply" && (
              <button type="button" onClick={handleCancelApply} className="h-14 border border-red-800 px-5 text-sm font-semibold text-red-300 hover:border-red-600">
                Cancel
              </button>
            )}
            {hasRolledLoadout && (!lockedIn || !iApplied) && (
              <button
                type="button"
                onClick={handleApply}
                disabled={Boolean(applyDisabledReason)}
                title={applyDisabledReason ?? "Apply this loadout"}
                className="font-wide inline-flex h-14 min-w-[220px] items-center justify-center gap-2 bg-bungie-blue px-7 text-[15px] font-bold text-bungie-dark transition-colors hover:bg-white disabled:opacity-40"
              >
                {loadingAction === "apply" ? <Spinner size={16} /> : null}
                {loadingAction === "apply" ? "Applying" : "Apply loadout"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
