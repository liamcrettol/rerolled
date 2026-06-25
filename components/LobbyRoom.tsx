"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Lobby, LobbyMember, LobbyLoadoutSlot } from "@/types/lobby";
import type { DestinyCharacter } from "@/types/bungie";
import type { WeaponSlot } from "@/types/bungie";
import LoadoutQueue from "./LoadoutQueue";
import ApplyStatus from "./ApplyStatus";
import { signOut } from "next-auth/react";
import WeaponPool from "./WeaponPool";
import RollDetails, { type RollsData } from "./RollDetails";
import type { ApplyResult } from "@/types/lobby";
import { trimBungieName } from "@/lib/utils";
import PlayerCard from "./PlayerCard";

interface PlayerStat {
  userId: string;
  displayName: string;
  kills: number;
  deaths: number;
  assists: number;
  kd: number;
  rouletteWeaponKills: number;
  won?: boolean | null;
}

interface RoundRecord {
  sessionId: string;
  playedAt: string;
  roundNum: number;
  stats: PlayerStat[];
  weapons?: Record<string, { name: string; icon: string }>;
  mapName?: string | null;
}

interface LeaderboardEntry {
  userId: string;
  displayName: string;
  gamesPlayed: number;
  totalKills: number;
  avgKd: number;
  wins: number;
  losses: number;
}

interface Props {
  lobby: Lobby;
  initialMembers: LobbyMember[];
  currentUserId: string;
  currentUserDisplayName: string;
  bungieMembershipType: number;
  bungieMembershipId: string;
}

const CLASS_NAMES: Record<number, string> = { 0: "Titan", 1: "Hunter", 2: "Warlock" };
// Display order for the character picker: Warlock, Hunter, Titan (left to right).
const CLASS_ORDER = [2, 1, 0];
const SLOT_LABELS: Record<WeaponSlot, string> = { kinetic: "Kinetic", energy: "Energy", power: "Power" };
// How often each client checks Bungie for the finished game. The PGCR takes a
// couple minutes to appear on Bungie's side; once it does, a tight interval
// grabs it fast. Every fireteam member that has the page open polls, so the
// first one to see it records and pushes to everyone via realtime.
const POLL_INTERVAL_MS = 10_000;

const LOBBY_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  waiting: { label: "Waiting", cls: "border-bungie-border text-gray-400" },
  rolling: { label: "Rolling", cls: "border-bungie-blue/50 bg-bungie-blue/10 text-bungie-blue" },
  applying: { label: "Applying", cls: "border-bungie-blue/50 bg-bungie-blue/10 text-bungie-blue" },
  in_game: { label: "● In game", cls: "border-green-600/50 bg-green-900/20 text-green-400" },
  done: { label: "Ended", cls: "border-gray-700 text-gray-500" },
};

// Per-slot mode cycle: Random → Locked → Your own.
type SlotMode = "normal" | "lock" | "wildcard";
const SLOT_MODE_CONFIG: Record<SlotMode, { icon: string; label: string; cls: string }> = {
  normal: { icon: "🎲", label: "Random", cls: "border-bungie-border text-gray-400 hover:border-gray-400" },
  lock: { icon: "🔒", label: "Locked", cls: "border-yellow-500 bg-yellow-500/20 text-yellow-300" },
  wildcard: { icon: "👤", label: "Your own", cls: "border-purple-500 bg-purple-500/20 text-purple-300" },
};

interface SessionTotal {
  userId: string;
  displayName: string;
  kills: number;
  deaths: number;
  assists: number;
  rouletteWeaponKills: number;
  games: number;
}

// Running cumulative K/A/D per player across every recorded game this lobby.
function SessionTotalsTable({ totals }: { totals: SessionTotal[] }) {
  const sorted = [...totals].sort((a, b) => b.kills - a.kills);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-500 text-xs border-b border-bungie-border">
            <th className="text-left pb-2 pr-4">Player</th>
            <th className="text-right pb-2 pr-3">K</th>
            <th className="text-right pb-2 pr-3">A</th>
            <th className="text-right pb-2 pr-3">D</th>
            <th className="text-right pb-2 pr-3">K/D</th>
            <th className="text-right pb-2">Games</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bungie-border/40">
          {sorted.map((s, i) => (
            <tr key={s.userId} className={i === 0 ? "text-yellow-400" : "text-gray-300"}>
              <td className="py-2 pr-4 font-medium">{i === 0 ? "👑 " : ""}{s.displayName}</td>
              <td className="py-2 pr-3 text-right">{s.kills}</td>
              <td className="py-2 pr-3 text-right">{s.assists}</td>
              <td className="py-2 pr-3 text-right">{s.deaths}</td>
              <td className="py-2 pr-3 text-right">{(s.deaths > 0 ? s.kills / s.deaths : s.kills).toFixed(2)}</td>
              <td className="py-2 text-right text-gray-500">{s.games}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatsTable({ stats }: { stats: PlayerStat[] }) {
  const sorted = [...stats].sort((a, b) => b.kills - a.kills);
  const hasWon = stats.some((s) => s.won != null);
  return (
    <div className="overflow-x-auto rounded-lg border border-bungie-border/60 bg-bungie-dark/40">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-500 text-xs border-b border-bungie-border/60">
            <th className="text-left px-3 py-2">Player</th>
            {hasWon && <th className="text-center px-2 py-2">Result</th>}
            <th className="text-right px-2 py-2">K</th>
            <th className="text-right px-2 py-2">D</th>
            <th className="text-right px-2 py-2">A</th>
            <th className="text-right px-3 py-2">K/D</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bungie-border/40">
          {sorted.map((s, i) => (
            <tr key={s.userId} className={i === 0 ? "text-yellow-400" : "text-gray-300"}>
              <td className="px-3 py-2 font-medium">
                {i === 0 ? "👑 " : ""}{trimBungieName(s.displayName)}
              </td>
              {hasWon && (
                <td className="px-2 py-2 text-center">
                  {s.won === true
                    ? <span className="text-[10px] font-bold text-green-400 bg-green-400/10 border border-green-400/30 rounded px-1.5 py-0.5">W</span>
                    : s.won === false
                    ? <span className="text-[10px] font-bold text-red-400 bg-red-400/10 border border-red-400/30 rounded px-1.5 py-0.5">L</span>
                    : <span className="text-gray-500 text-xs">—</span>}
                </td>
              )}
              <td className="px-2 py-2 text-right tabular-nums">{s.kills}</td>
              <td className="px-2 py-2 text-right tabular-nums">{s.deaths}</td>
              <td className="px-2 py-2 text-right tabular-nums">{s.assists}</td>
              <td className="px-3 py-2 text-right tabular-nums text-gray-400">{s.kd.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
        <img
          src="/icons/destiny-default.svg"
          alt=""
          className="w-8 h-8 rounded border border-white/10"
        />
      );
    }
    return (
      <img
        src={CLASS_ICON_PATHS[classType] ?? CLASS_ICON_PATHS[0]}
        alt=""
        className="w-8 h-8 rounded border border-white/10"
        onError={() => setClassIconFailed(true)}
      />
    );
  }

  return (
    <img
      src={`https://www.bungie.net${emblemPath}`}
      alt=""
      className="w-8 h-8 rounded border border-white/10 object-cover"
      onError={() => setEmblemFailed(true)}
    />
  );
}

function LightLevelIcon({ light }: { light: number }) {
  return (
    <span className="flex items-center gap-1">
      <svg viewBox="0 0 24 24" className="w-4 h-4 text-yellow-400" fill="currentColor">
        <circle cx="12" cy="12" r="2" />
        <path d="M12 1v6m0 4v6M1 12h6m4 0h6M3.22 3.22l4.24 4.24m5.08 0l4.24-4.24M3.22 20.78l4.24-4.24m5.08 0l4.24 4.24" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </svg>
      <span>{light}</span>
    </span>
  );
}

export default function LobbyRoom({
  lobby,
  initialMembers,
  currentUserId,
  bungieMembershipType,
  bungieMembershipId,
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [lobbyData, setLobbyData] = useState<Lobby>(lobby);
  const [members, setMembers] = useState<LobbyMember[]>(initialMembers);
  const [characters, setCharacters] = useState<DestinyCharacter[]>([]);
  // Pre-select the guardian this player already chose (persists across rounds/rejoins).
  const [selectedCharId, setSelectedCharId] = useState<string | null>(
    initialMembers.find((m) => m.user_id === currentUserId)?.selected_character_id ?? null
  );
  const [slots, setSlots] = useState<LobbyLoadoutSlot[]>([]);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [intersection, setIntersection] = useState<Record<WeaponSlot, number[]> | null>(null);
  const [weaponDetails, setWeaponDetails] = useState<Record<string, {
    name: string; icon: string; watermark?: string; weaponType: string; damageType: string;
    tierType: number; tierName: string; ammoType: string; stats: Record<string, number>;
  }>>({});
  const [instancePerks, setInstancePerks] = useState<Record<string, Array<{ instanceId: string; perks: string[]; location: string; characterId?: string }>>>({});
  const [collectionHashes, setCollectionHashes] = useState<Set<number>>(new Set());
  const [preferredInstances, setPreferredInstances] = useState<Partial<Record<WeaponSlot, string>>>({});
  // Per-player roll data (everyone's instances of the current loadout) and the
  // instance THIS player has chosen to equip for each slot.
  const [rollsData, setRollsData] = useState<RollsData>({});
  const [myChosenInstances, setMyChosenInstances] = useState<Partial<Record<WeaponSlot, string>>>({});
  const [rollsLoading, setRollsLoading] = useState(false);
  const [rollsError, setRollsError] = useState<string | null>(null);
  // Favorited roll per weapon hash (weaponHash -> instanceId), persisted. When a
  // weapon is randomized, the player's favorited instance is auto-selected.
  const [favorites, setFavorites] = useState<Record<string, string>>({});
  const [applyResults, setApplyResults] = useState<ApplyResult[]>([]);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [intersectionError, setIntersectionError] = useState<string | null>(null);
  const [lockedSlots, setLockedSlots] = useState<Set<WeaponSlot>>(new Set());
  const [wildcardSlots, setWildcardSlots] = useState<Set<WeaponSlot>>(new Set<WeaponSlot>(["power"]));
  // Current game results (prominent card, clears when captain rolls)
  const [lastGameStats, setLastGameStats] = useState<PlayerStat[] | null>(null);
  // All past rounds for scrollable history
  const [roundHistory, setRoundHistory] = useState<RoundRecord[]>([]);
  const [expandedRound, setExpandedRound] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedWatch, setCopiedWatch] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasAutoSelected = useRef(false);

  // Stats panel tab: session totals | match history | global leaderboard
  const [statsTab, setStatsTab] = useState<"session" | "history" | "leaderboard">("session");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  // Captain-only toggles
  const [captainLocked, setCaptainLocked] = useState(lobby.captain_locked ?? false);
  const [showWeaponBrowser, setShowWeaponBrowser] = useState(true);

  // Roll preferences (persisted in localStorage, captain-controlled)
  const [rollMode, setRollMode] = useState<"normal" | "chaos" | "meta">("normal");
  const [noDupMode, setNoDupMode] = useState(false);
  const [bannedTypes, setBannedTypes] = useState<Set<string>>(new Set());
  const [rerollLimit, setRerollLimit] = useState<number | null>(null); // null = unlimited
  const [rerollsUsed, setRerollsUsed] = useState(0);
  const [showRollSettings, setShowRollSettings] = useState(false);

  // Every weapon rolled per slot this lobby session (most-recent first). Rolls
  // avoid everything already used in that slot until the shared pool is
  // exhausted, then start repeating from the least-recently-used.
  const recentRollsRef = useRef<Record<WeaponSlot, number[]>>({ kinetic: [], energy: [], power: [] });
  // Why each slot last changed, so the loadout animates a spin (roll) vs a
  // quick pop (manual browser pick).
  const animKindRef = useRef<Record<string, "roll" | "pick">>({});
  const recordRoll = useCallback((slot: WeaponSlot, hash: number) => {
    if (!hash) return;
    const hist = recentRollsRef.current[slot];
    if (hist[0] === hash) return; // unchanged, don't duplicate
    recentRollsRef.current[slot] = [hash, ...hist.filter((h) => h !== hash)];
  }, []);

  // Load saved roll prefs (banned types, reroll limit) once on mount. Mode is
  // intentionally NOT persisted - it resets to Normal each time you enter a lobby.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("gr_roll_prefs");
      if (!raw) return;
      const p = JSON.parse(raw);
      if (Array.isArray(p.banned)) setBannedTypes(new Set(p.banned));
      if (p.rerollLimit === null || typeof p.rerollLimit === "number") setRerollLimit(p.rerollLimit);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("gr_roll_prefs", JSON.stringify({ banned: [...bannedTypes], rerollLimit }));
    } catch { /* ignore */ }
  }, [bannedTypes, rerollLimit]);

  // Keep captainLocked in sync with real-time lobby updates
  useEffect(() => { setCaptainLocked(lobbyData.captain_locked ?? false); }, [lobbyData.captain_locked]);

  // Reset the reroll budget at the start of each round.
  useEffect(() => { setRerollsUsed(0); }, [lobbyData.current_round]);

  // Load/save favorited rolls.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("gr_fav_rolls");
      if (raw) setFavorites(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("gr_fav_rolls", JSON.stringify(favorites)); } catch { /* ignore */ }
  }, [favorites]);

  const favoritesRef = useRef(favorites);
  useEffect(() => { favoritesRef.current = favorites; }, [favorites]);

  const toggleFavorite = useCallback((slot: WeaponSlot, hash: number, instanceId: string) => {
    const key = hash.toString();
    setFavorites((prev) => {
      const next = { ...prev };
      if (next[key] === instanceId) delete next[key];
      else next[key] = instanceId;
      return next;
    });
    // Favoriting also selects it for this slot right away.
    setMyChosenInstances((prev) => ({ ...prev, [slot]: instanceId }));
  }, []);

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

  const rerollExhausted = rerollLimit !== null && rerollsUsed >= rerollLimit;

  // Fetch every member's rolls (their instances + perk-adjusted stats) for the
  // current loadout, so each player sees THEIR own roll and can compare/swap.
  const slotKey = (["kinetic", "energy", "power"] as WeaponSlot[])
    .map((s) => slots.find((x) => x.slot === s)?.item_hash ?? 0).join(",");
  const fetchRolls = useCallback(async () => {
    if (!roundId) return;
    setRollsLoading(true);
    setRollsError(null);
    try {
      const res = await fetch("/api/roulette/rolls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobbyId: lobby.id, roundId }),
      });
      const data = await res.json();
      if (!res.ok) { setRollsError(data.error ?? "Failed to load rolls"); setRollsLoading(false); return; }
      const next: RollsData = data.slots ?? {};
      setRollsData(next);
      // Default each slot to my best instance (prefer one already on a character),
      // keeping any still-valid existing choice.
      setMyChosenInstances((prev) => {
        const out: Partial<Record<WeaponSlot, string>> = {};
        for (const s of ["kinetic", "energy", "power"] as WeaponSlot[]) {
          const mine = next[s]?.members.find((m) => m.isMe)?.instances ?? [];
          if (mine.length === 0) continue;
          // Priority: favorited roll for this weapon > still-valid prior choice > best available.
          const favId = favoritesRef.current[(next[s]?.itemHash ?? 0).toString()];
          const favOwned = favId && mine.some((i) => i.instanceId === favId);
          const keep = prev[s] && mine.some((i) => i.instanceId === prev[s]);
          out[s] = favOwned ? favId : keep ? prev[s]! : (mine.find((i) => i.location === "character") ?? mine[0]).instanceId;
        }
        return out;
      });
    } catch (e) {
      setRollsError(e instanceof Error ? e.message : "Failed to load rolls");
    }
    setRollsLoading(false);
  }, [lobby.id, roundId]);

  useEffect(() => {
    if (roundId && slots.some((s) => s.item_hash !== 0)) fetchRolls();
    else setRollsData({});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId, slotKey]);

  const handleChooseInstance = useCallback((slot: WeaponSlot, instanceId: string) => {
    setMyChosenInstances((prev) => ({ ...prev, [slot]: instanceId }));
  }, []);

  // Build a display type key that distinguishes special-ammo weapons (e.g. Rocket Sidearms)
  // from their primary-ammo counterparts by appending " · Special".
  const weaponDisplayType = useCallback((h: number): string => {
    const d = weaponDetails[h.toString()];
    if (!d) return "";
    return d.ammoType === "Special" ? `${d.weaponType} · Special` : d.weaponType;
  }, [weaponDetails]);

  // Pool with banned weapon types removed - drives both the browser and rolls.
  const effectiveIntersection = useMemo(() => {
    if (!intersection) return null;
    if (bannedTypes.size === 0) return intersection;
    const filt = (arr: number[]) =>
      arr.filter((h) => !bannedTypes.has(weaponDisplayType(h)));
    return { kinetic: filt(intersection.kinetic), energy: filt(intersection.energy), power: filt(intersection.power) };
  }, [intersection, bannedTypes, weaponDisplayType]);

  // Distinct weapon types in the current pool (for the ban checkboxes).
  const poolWeaponTypes = useMemo(() => {
    if (!intersection) return [] as string[];
    const s = new Set<string>();
    for (const slot of ["kinetic", "energy", "power"] as WeaponSlot[])
      for (const h of intersection[slot]) {
        const t = weaponDisplayType(h);
        if (t) s.add(t);
      }
    return [...s].sort();
  }, [intersection, weaponDisplayType]);

  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(lobby.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable; ignore
    }
  }, [lobby.code]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/join/${lobby.code}`);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1500);
    } catch {
      // clipboard unavailable; ignore
    }
  }, [lobby.code]);

  const copyWatchLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/watch/${lobby.code}`);
      setCopiedWatch(true);
      setTimeout(() => setCopiedWatch(false), 1500);
    } catch {
      // clipboard unavailable; ignore
    }
  }, [lobby.code]);

  // Stats only record once at least two players have picked a guardian.
  const charactersPicked = members.filter((m) => !m.is_spectator && m.selected_character_id).length;

  const applyAbortRef = useRef<AbortController | null>(null);
  const roundIdRef = useRef<string | null>(null);
  useEffect(() => { roundIdRef.current = roundId; }, [roundId]);
  const hasAutoLoaded = useRef(false);
  const prevRoundIdRef = useRef<string | null>(null);
  // Clear per-round UI state when the round actually advances (non-null → different non-null).
  useEffect(() => {
    if (roundId && prevRoundIdRef.current && roundId !== prevRoundIdRef.current) {
      setSlots([]);
      setApplyResults([]);
      setLockedSlots(new Set());
      setWildcardSlots(new Set<WeaponSlot>(["power"]));
      setPreferredInstances({});
      hasAutoLoaded.current = false;
    }
    prevRoundIdRef.current = roundId;
  }, [roundId]);

  const isCaptain = members.find((m) => m.user_id === currentUserId)?.is_captain ?? false;
  const isHost = lobbyData.host_user_id === currentUserId;
  const isSpectator = members.find((m) => m.user_id === currentUserId)?.is_spectator ?? false;
  const captainMember = members.find((m) => m.is_captain);
  const captainName = captainMember ? trimBungieName(captainMember.display_name) : null;

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setPolling(false);
  }, []);

  const fetchHistory = useCallback(async (switchTab?: boolean) => {
    const res = await fetch(`/api/stats/history?lobbyId=${lobby.id}`);
    const data = await res.json();
    if (data.rounds) {
      setRoundHistory(data.rounds);
      if (data.rounds.length > 0) {
        setExpandedRound(data.rounds[data.rounds.length - 1].sessionId);
        if (switchTab) setStatsTab("history");
      }
    }
  }, [lobby.id]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const detectGameEnd = useCallback(async () => {
    try {
      const res = await fetch("/api/stats/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobbyId: lobby.id }),
      });
      const data = await res.json();
      if (data.done && data.stats) {
        stopPolling();
        setLastGameStats(data.stats);
        fetchHistory(true);
        // Per-round state is cleared by the prevRoundIdRef effect when roundId changes.
      }
      // If a game is pending but not yet found, return whether we should poll
      return data.pending ?? false;
    } catch {
      // ignore poll errors
      return false;
    }
  }, [lobby.id, stopPolling, fetchHistory]);

  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return;
    setPolling(true);
    detectGameEnd();
    pollTimerRef.current = setInterval(detectGameEnd, POLL_INTERVAL_MS);
  }, [detectGameEnd]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // When a loadout is applied (status flips to in_game, seen via realtime by
  // every member), everyone starts polling - so whoever's PGCR appears first
  // records it and pushes to the rest. startPolling is a no-op if already running.
  useEffect(() => {
    if (lobbyData.status === "in_game") startPolling();
  }, [lobbyData.status, startPolling]);

  // On mount: check if a game was in progress when everyone left the lobby.
  // If detect says pending=true, start polling so we catch up automatically.
  useEffect(() => {
    detectGameEnd().then((pending) => {
      if (pending) startPolling();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`lobby:${lobby.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lobbies", filter: `id=eq.${lobby.id}` },
        (payload) => setLobbyData(payload.new as Lobby)
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lobby_members", filter: `lobby_id=eq.${lobby.id}` },
        (payload) => {
          setMembers((prev) => [...prev.filter((m) => m.id !== (payload.new as LobbyMember).id), payload.new as LobbyMember]);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lobby_members", filter: `lobby_id=eq.${lobby.id}` },
        (payload) => {
          setMembers((prev) => prev.map((m) => m.id === (payload.new as LobbyMember).id ? payload.new as LobbyMember : m));
        }
      )
      .on(
        "postgres_changes",
        // DELETE without a filter: Supabase only includes the PK (id) in payload.old
        // unless REPLICA IDENTITY FULL is set (see migration 011). We filter by checking
        // if the deleted id is actually in our current members list.
        { event: "DELETE", schema: "public", table: "lobby_members" },
        (payload) => {
          const deletedId = (payload.old as { id?: string }).id;
          if (deletedId) setMembers((prev) => prev.filter((m) => m.id !== deletedId));
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "game_sessions", filter: `lobby_id=eq.${lobby.id}` },
        () => {
          // Refresh history for all clients when a new game is logged
          fetchHistory();
          if (!lastGameStats) detectGameEnd();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lobby_loadout_slots" },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const s = payload.new as LobbyLoadoutSlot;
            if (!roundIdRef.current || s.round_id !== roundIdRef.current) return;
            if (s.item_hash !== 0) recordRoll(s.slot as WeaponSlot, s.item_hash);
            setSlots((prev) => [...prev.filter((x) => x.slot !== s.slot), s]);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobby.id, supabase]);

  useEffect(() => {
    fetch("/api/bungie/characters")
      .then((r) => r.json())
      .then((d) => { if (d.characters) setCharacters(d.characters); });
  }, []);

  useEffect(() => {
    if (hasAutoLoaded.current) return;
    if (!isCaptain || !roundId) return;
    hasAutoLoaded.current = true;
    handleLoadIntersection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCaptain, roundId]);

  useEffect(() => {
    async function loadCurrentRound() {
      const { data: round } = await supabase
        .from("lobby_rounds")
        .select("id")
        .eq("lobby_id", lobby.id)
        .eq("round_number", lobbyData.current_round)
        .single();
      if (round) {
        setRoundId(round.id);
        const { data: existingSlots } = await supabase
          .from("lobby_loadout_slots")
          .select("*")
          .eq("round_id", round.id);
        if (existingSlots) {
          setSlots(existingSlots);
          // Reconstruct wildcard state: slots stored with item_hash=0 are wildcards ("Your own").
          const wc = new Set<WeaponSlot>(
            existingSlots.filter((s) => s.item_hash === 0).map((s) => s.slot as WeaponSlot)
          );
          // Default power to wildcard unless the captain explicitly rolled a real heavy
          const hasPowerRoll = existingSlots.some((s) => s.slot === "power" && s.item_hash !== 0);
          if (!hasPowerRoll) wc.add("power");
          setWildcardSlots(wc);
          for (const s of existingSlots) {
            if (s.item_hash !== 0) recordRoll(s.slot as WeaponSlot, s.item_hash);
          }
        }
      }
    }
    loadCurrentRound();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobby.id, lobbyData.current_round]);

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
    if (!confirm("End this session for everyone? This will close the lobby.")) return;
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
  }, [characters, handleSelectCharacter]);

  const handleLoadIntersection = useCallback(async () => {
    setLoadingAction("intersection");
    setIntersectionError(null);
    try {
      const res = await fetch("/api/roulette/intersection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobbyId: lobby.id, characterId: selectedCharId ?? undefined }),
      });
      const data = await res.json();
      if (!data.intersection) {
        setIntersectionError(data.error ?? "Failed to load shared weapons");
        setLoadingAction(null);
        return;
      }
      setIntersection(data.intersection);
      setWeaponDetails(data.weaponDetails ?? {});
      setInstancePerks(data.instancePerks ?? {});
      setCollectionHashes(new Set<number>(data.collectionHashes ?? []));
      if (isCaptain && roundId) {
        const equipped: Record<string, number> = {};
        const eq = data.equippedHashes as Record<string, number | null>;
        for (const slot of ["kinetic", "energy", "power"]) {
          if (eq?.[slot] != null) equipped[slot] = eq[slot]!;
        }
        await fetch("/api/roulette/roll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lobbyId: lobby.id, roundId, intersection: data.intersection,
            weaponDetails: data.weaponDetails ?? {},
            keepSlots: Object.keys(equipped).length > 0 ? equipped : undefined,
          }),
        });
      }
    } catch (e) {
      setIntersectionError(e instanceof Error ? e.message : "Network error");
    }
    setLoadingAction(null);
  }, [lobby.id, isCaptain, slots.length, roundId, selectedCharId]);

  // Write a roll for an explicit wildcard set (avoids stale wildcardSlots state).
  // Keeps every slot's current real weapon except wildcards, the sentinel 0, and
  // an optional slot being rerolled. extraKeep injects additional slot→hash pairs
  // (used to restore a previous roll when leaving wildcard mode).
  const rollWithModes = useCallback(async (
    nextWildcards: Set<WeaponSlot>,
    rerollSlot?: WeaponSlot,
    extraKeep?: Partial<Record<WeaponSlot, number>>
  ) => {
    if (!intersection || !roundId) return;
    for (const s of ["kinetic", "energy", "power"]) animKindRef.current[s] = "roll";
    setLoadingAction("roll");
    const keep: Record<string, number> = {};
    for (const s of slots) {
      const sl = s.slot as WeaponSlot;
      if (nextWildcards.has(sl)) continue;
      if (sl === rerollSlot) continue;
      if (s.item_hash === 0) continue;
      keep[sl] = s.item_hash;
    }
    if (extraKeep) {
      for (const [sl, hash] of Object.entries(extraKeep) as [WeaponSlot, number][]) {
        if (hash && !keep[sl]) keep[sl] = hash;
      }
    }
    const avoid = { ...recentRollsRef.current };
    await fetch("/api/roulette/roll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lobbyId: lobby.id, roundId, intersection: effectiveIntersection ?? intersection, weaponDetails,
        keepSlots: Object.keys(keep).length > 0 ? keep : undefined,
        avoid,
        wildcardSlots: Array.from(nextWildcards),
        mode: rollMode,
        nodup: noDupMode || undefined,
      }),
    });
    setLoadingAction(null);
  }, [intersection, effectiveIntersection, roundId, lobby.id, slots, weaponDetails, rollMode, noDupMode]);

  // Cycle a slot through Random → 🔒 Locked → 👤 Your own → Random.
  // Locked = keep this shared weapon on Roll All. Your own = skip slot on apply
  // (each player keeps their own equipped weapon). Toggling on/off "Your own"
  // writes the change immediately so the slot grays / repopulates right away.
  const cycleSlotMode = useCallback((slot: WeaponSlot) => {
    const locked = lockedSlots.has(slot);
    const wildcard = wildcardSlots.has(slot);
    if (!locked && !wildcard) {
      // Random -> Locked (no roll; current weapon stays, now pinned)
      setLockedSlots((prev) => new Set(prev).add(slot));
    } else if (locked) {
      // Locked -> Your own (write the sentinel so it grays + skips on apply)
      setLockedSlots((prev) => { const n = new Set(prev); n.delete(slot); return n; });
      const next = new Set(wildcardSlots).add(slot);
      setWildcardSlots(next);
      rollWithModes(next);
    } else {
      // Your own -> Random (restore the previous roll for this slot if we have one)
      const next = new Set(wildcardSlots); next.delete(slot);
      setWildcardSlots(next);
      const previousHash = recentRollsRef.current[slot][0];
      if (previousHash) {
        rollWithModes(next, undefined, { [slot]: previousHash });
      } else {
        rollWithModes(next, slot);
      }
    }
  }, [lockedSlots, wildcardSlots, rollWithModes]);

  const handleRoll = useCallback(async (rerollSlot?: WeaponSlot) => {
    if (!intersection || !roundId) return;
    if (rerollExhausted) return; // reroll budget spent for this round
    // Slots about to roll should animate as a spin.
    if (rerollSlot) animKindRef.current[rerollSlot] = "roll";
    else for (const s of ["kinetic", "energy", "power"]) animKindRef.current[s] = "roll";
    setLoadingAction("roll");
    // Dismiss the prominent last-game card when captain rolls for a new round
    setLastGameStats(null);
    const effectiveWildcards = new Set(wildcardSlots);
    if (rerollSlot) effectiveWildcards.delete(rerollSlot);
    let keepSlots: Record<string, number> | undefined;
    if (rerollSlot) {
      keepSlots = Object.fromEntries(
        slots
          .filter((s) => s.slot !== rerollSlot && !effectiveWildcards.has(s.slot as WeaponSlot) && s.item_hash !== 0)
          .map((s) => [s.slot, s.item_hash])
      );
    } else {
      // Roll All re-rolls every non-locked, non-wildcard slot (power included).
      const kept = slots.filter((s) => {
        if (s.item_hash === 0) return false; // never keep the wildcard sentinel
        if (effectiveWildcards.has(s.slot as WeaponSlot)) return false;
        return lockedSlots.has(s.slot as WeaponSlot);
      });
      if (kept.length > 0) keepSlots = Object.fromEntries(kept.map((s) => [s.slot, s.item_hash]));
    }
    // Avoid repeating any of the last few weapons per slot
    const avoid = { ...recentRollsRef.current };
    await fetch("/api/roulette/roll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId: lobby.id, roundId, intersection: effectiveIntersection ?? intersection, weaponDetails, rerollSlot, keepSlots, avoid, wildcardSlots: Array.from(effectiveWildcards), mode: rollMode, nodup: noDupMode || undefined }),
    });
    setRerollsUsed((n) => n + 1);
    setLoadingAction(null);
  }, [intersection, effectiveIntersection, roundId, lobby.id, slots, weaponDetails, lockedSlots, wildcardSlots, rollMode, noDupMode, rerollExhausted]);

  const handleApply = useCallback(async () => {
    if (!selectedCharId || !roundId) return;
    const controller = new AbortController();
    applyAbortRef.current = controller;
    setLoadingAction("apply");
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Each player equips their OWN chosen instance; fall back to the
        // captain's per-slot pick from the browser for anything unset.
        body: JSON.stringify({ lobbyId: lobby.id, roundId, characterId: selectedCharId, preferredInstances: { ...preferredInstances, ...myChosenInstances } }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.results) {
        setApplyResults(data.results);
        startPolling();
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") console.error("Apply failed:", e);
    }
    applyAbortRef.current = null;
    setLoadingAction(null);
  }, [selectedCharId, roundId, lobby.id, preferredInstances, myChosenInstances, startPolling]);

  const handleCancelApply = useCallback(() => {
    applyAbortRef.current?.abort();
    applyAbortRef.current = null;
    setLoadingAction(null);
  }, []);

  const handleSelectWeapon = useCallback(async (slot: WeaponSlot, hash: number, instanceId?: string) => {
    if (!intersection || !roundId) return;
    animKindRef.current[slot] = "pick"; // animate as a manual pick, not a spin
    setLoadingAction("roll");
    setLastGameStats(null);
    if (instanceId) {
      setPreferredInstances((prev) => ({ ...prev, [slot]: instanceId }));
    } else {
      setPreferredInstances((prev) => { const n = { ...prev }; delete n[slot]; return n; });
    }
    const keep: Partial<Record<WeaponSlot, number>> = {};
    for (const s of slots) { if (s.item_hash !== 0) keep[s.slot as WeaponSlot] = s.item_hash; }
    keep[slot] = hash;
    // Destiny allows only one exotic equipped. If the captain picks an exotic,
    // release any OTHER slot that's currently exotic so it re-rolls non-exotic.
    const isExotic = (h?: number) => h !== undefined && (weaponDetails[h.toString()]?.tierType ?? 5) === 6;
    if (isExotic(hash)) {
      for (const s of Object.keys(keep) as WeaponSlot[]) {
        if (s !== slot && isExotic(keep[s])) {
          delete keep[s];
          setPreferredInstances((prev) => { const n = { ...prev }; delete n[s]; return n; });
        }
      }
    }
    await fetch("/api/roulette/roll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId: lobby.id, roundId, intersection, weaponDetails, keepSlots: keep }),
    });
    setLoadingAction(null);
  }, [intersection, roundId, lobby.id, slots, weaponDetails]);

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

  const handleToggleCaptainLock = useCallback(async () => {
    const next = !captainLocked;
    setCaptainLocked(next);
    await fetch("/api/lobby/captain-lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId: lobby.id, locked: next }),
    });
  }, [captainLocked, lobby.id]);

  // The shared weapon pool is viewable by every player. The captain can select
  // weapons into the loadout; everyone else gets a read-only browse view.
  const weaponBrowser = intersection && showWeaponBrowser ? (
    <WeaponPool
      intersection={effectiveIntersection ?? intersection}
      weaponDetails={weaponDetails}
      instancePerks={instancePerks}
      collectionHashes={collectionHashes}
      currentHashes={Object.fromEntries(slots.filter((s) => s.item_hash !== 0).map((s) => [s.slot, s.item_hash]))}
      currentInstances={preferredInstances}
      onSelectWeapon={(slot, hash, instanceId) => handleSelectWeapon(slot, hash, instanceId)}
      favorites={favorites}
      onToggleFavorite={toggleFavorite}
      disabled={loadingAction !== null}
      readOnly={!isCaptain}
    />
  ) : null;

  // Header row for the weapon-pool panel (shared between the mobile and sidebar
  // placements). `pad` adds the sidebar's inset padding.
  const poolHeader = (pad: boolean) => (
    <div className={`flex items-center justify-between mb-3 ${pad ? "px-4 pt-4" : ""}`}>
      <div className="flex items-center gap-2">
        <h2 className="text-white font-semibold">Shared Weapon Pool</h2>
        {!isCaptain && (
          <span className="text-[10px] uppercase tracking-wide text-gray-400 border border-bungie-border rounded px-1.5 py-0.5">
            View only
          </span>
        )}
      </div>
      {intersection && (
        <button
          onClick={() => setShowWeaponBrowser((v) => !v)}
          className="text-xs px-2.5 py-1 rounded border border-bungie-border text-gray-400 hover:border-gray-400 transition"
        >
          {showWeaponBrowser ? "Minimize" : "Expand"}
        </button>
      )}
    </div>
  );

  // Non-captains load the pool on demand (avoids firing a Bungie inventory
  // fetch for every viewer unless they actually want to see it).
  const poolLoadButton = (pad: boolean) => !isCaptain ? (
    <div className={pad ? "px-4 pb-4" : "pb-2"}>
      <div className="relative rounded-xl border-2 border-bungie-blue/60 bg-bungie-blue/10 p-4">
        {/* Pulse ring to draw the eye */}
        <span className="absolute -inset-px rounded-xl border border-bungie-blue/40 animate-pulse pointer-events-none" />
        <p className="text-white text-sm font-semibold mb-1">⚡ Load your shared weapons</p>
        <p className="text-gray-400 text-xs mb-3 leading-snug">
          Everyone needs to do this so the captain can roll a loadout you all own.
        </p>
        <button
          onClick={handleLoadIntersection}
          disabled={loadingAction !== null}
          className="w-full px-4 py-2.5 bg-bungie-blue rounded-lg text-sm text-white font-semibold hover:opacity-90 disabled:opacity-50 transition"
        >
          {loadingAction === "intersection" ? "Loading…" : "Load Shared Weapons"}
        </button>
        {intersectionError && <p className="mt-2 text-xs text-red-400 break-all">{intersectionError}</p>}
      </div>
    </div>
  ) : null;

  // Whether to render the pool panel at all: any non-spectator, once there's
  // either a loaded pool or (for non-captains) a load affordance to offer.
  const showPoolPanel = !isSpectator && (intersection != null || !isCaptain);

  return (
    <>
    <div className="flex gap-6 items-start">
      <div className="flex-1 min-w-0 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Lobby</h1>
            <div className="text-gray-400 text-sm flex items-center gap-2 flex-wrap mt-0.5">
              <button
                onClick={copyCode}
                title="Copy lobby code"
                className="font-mono text-bungie-blue font-bold tracking-widest hover:opacity-75 transition"
              >
                {copied ? "✓" : lobby.code}
              </button>
              <button
                onClick={copyLink}
                className="text-xs px-2 py-0.5 rounded border border-bungie-border text-gray-300 hover:border-gray-400 transition"
              >
                {copiedLink ? "✓ Copied" : "Invite"}
              </button>
              <button
                onClick={copyWatchLink}
                className="text-xs px-2 py-0.5 rounded border border-bungie-border text-gray-300 hover:border-gray-400 transition"
              >
                {copiedWatch ? "✓ Copied" : "Watch link"}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {(() => {
              const cfg = LOBBY_STATUS_BADGE[lobbyData.status] ?? LOBBY_STATUS_BADGE.waiting;
              return <span className={`text-xs px-2 py-0.5 rounded-full border ${cfg.cls}`}>{cfg.label}</span>;
            })()}
            <span className="text-sm text-gray-400">Round {lobbyData.current_round}</span>
            {polling && (
              <span className="text-xs text-green-500 animate-pulse">● watching</span>
            )}
            {showPoolPanel && intersection && !showWeaponBrowser && (
              <button onClick={() => setShowWeaponBrowser(true)} className="hidden xl:block px-3 py-1.5 text-sm text-gray-400 border border-bungie-border rounded-lg hover:border-gray-400 transition">
                Weapon Pool ▼
              </button>
            )}
            {isHost && (
              <button onClick={handleEndSession} className="px-3 py-1.5 text-sm text-gray-400 border border-bungie-border rounded-lg hover:text-red-400 hover:border-red-800 transition">
                End Session
              </button>
            )}
            {!isCaptain && (
              <button onClick={handleToggleSpectate} title={isSpectator ? "Rejoin as a player" : "Step back to spectate without leaving"} className={`px-3 py-1.5 text-sm border rounded-lg transition ${isSpectator ? "text-bungie-blue border-bungie-blue/50 hover:border-bungie-blue" : "text-gray-400 border-bungie-border hover:text-bungie-blue hover:border-bungie-blue/50"}`}>
                {isSpectator ? "Rejoin" : "Spectate"}
              </button>
            )}
            <button onClick={handleLeave} className="px-3 py-1.5 text-sm text-gray-400 border border-bungie-border rounded-lg hover:text-red-400 hover:border-red-800 transition">
              Leave
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="text-sm text-gray-500 hover:text-gray-300 transition"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Stats panel: Session / History / Leaderboard tabs */}
        <div className="bg-bungie-surface border border-bungie-border rounded-xl overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-bungie-border">
            {(["session", "history", "leaderboard"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setStatsTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
                  statsTab === tab
                    ? "border-bungie-blue text-white"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                {tab === "session" ? "Session" : tab === "history" ? "Match History" : "Leaderboard"}
              </button>
            ))}
          </div>

          {/* Session totals */}
          {statsTab === "session" && (
            <div className="p-4">
              {sessionTotals.length > 0 ? (
                <>
                  <p className="text-xs text-gray-500 mb-3">Running K / A / D across all games this lobby</p>
                  <SessionTotalsTable totals={sessionTotals} />
                </>
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">No games recorded yet.</p>
              )}
            </div>
          )}

          {/* Match history */}
          {statsTab === "history" && (
            <div>
              {roundHistory.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">No games recorded yet.</p>
              ) : (
                <div className="divide-y divide-bungie-border/40">
                  {[...roundHistory].reverse().map((round) => {
                    const isOpen = expandedRound === round.sessionId;
                    const sorted = [...round.stats].sort((a, b) => b.kills - a.kills);
                    const topPlayer = sorted[0];
                    const teamResult = round.stats.find((s) => s.won != null)?.won ?? null;
                    const time = round.playedAt
                      ? new Date(round.playedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
                      : null;
                    return (
                      <div key={round.sessionId}>
                        <button
                          onClick={() => setExpandedRound(isOpen ? null : round.sessionId)}
                          className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-bungie-dark/40 transition"
                        >
                          {/* Round badge + W/L */}
                          <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                            <span className="text-[11px] font-bold text-gray-300 bg-bungie-border/60 rounded px-1.5 py-0.5 leading-none tabular-nums">
                              R{round.roundNum}
                            </span>
                            {teamResult === true && (
                              <span className="text-[10px] font-bold text-green-400 bg-green-400/10 border border-green-400/30 rounded px-1 leading-tight">W</span>
                            )}
                            {teamResult === false && (
                              <span className="text-[10px] font-bold text-red-400 bg-red-400/10 border border-red-400/30 rounded px-1 leading-tight">L</span>
                            )}
                          </div>

                          {/* Main content */}
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium leading-tight truncate">
                              {round.mapName ?? "Unknown map"}
                            </p>
                            {topPlayer && (
                              <p className="text-gray-400 text-xs mt-0.5 truncate">
                                👑 {topPlayer.displayName}
                                <span className="text-gray-500"> · </span>
                                <span className="text-white tabular-nums">{topPlayer.kills}K</span>
                                <span className="text-gray-500"> / </span>
                                <span className="tabular-nums">{topPlayer.deaths}D</span>
                                <span className="text-gray-500"> / </span>
                                <span className="tabular-nums">{topPlayer.assists}A</span>
                              </p>
                            )}
                          </div>

                          {/* Time + chevron */}
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {time && <span className="text-gray-500 text-xs tabular-nums">{time}</span>}
                            <span className="text-gray-400 text-xs">{isOpen ? "▲" : "▼"}</span>
                          </div>
                        </button>

                        {isOpen && (
                          <div className="px-4 pb-4 bg-bungie-dark/20">
                            {/* Rolled weapons */}
                            {round.weapons && Object.keys(round.weapons).length > 0 && (
                              <div className="mb-4 flex flex-wrap gap-2 pt-2">
                                {(["kinetic", "energy", "power"] as const).map((slot) => {
                                  const w = round.weapons![slot];
                                  if (!w) return null;
                                  const slotColor = slot === "kinetic" ? "text-gray-300 border-gray-500/40" : slot === "energy" ? "text-bungie-blue border-bungie-blue/40" : "text-purple-300 border-purple-500/40";
                                  return (
                                    <div key={slot} className={`flex items-center gap-2 bg-bungie-dark border rounded-lg px-2.5 py-2 ${slotColor.split(" ")[1]}`}>
                                      {w.icon && (
                                        <img
                                          src={`https://www.bungie.net${w.icon}`}
                                          alt=""
                                          className="w-8 h-8 rounded shrink-0"
                                        />
                                      )}
                                      <div>
                                        <p className={`text-[10px] font-semibold uppercase tracking-wide leading-none ${slotColor.split(" ")[0]}`}>{slot}</p>
                                        <p className="text-white text-xs font-medium leading-snug mt-0.5">{w.name}</p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            <StatsTable stats={round.stats} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Global leaderboard */}
          {statsTab === "leaderboard" && (
            <div className="p-4">
              {leaderboardLoading ? (
                <p className="text-sm text-gray-500 text-center py-4">Loading...</p>
              ) : !leaderboard || leaderboard.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No games recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-500 text-xs border-b border-bungie-border">
                        <th className="text-left pb-2 pr-2">#</th>
                        <th className="text-left pb-2 pr-4">Player</th>
                        <th className="text-right pb-2 pr-3">Games</th>
                        <th className="text-right pb-2 pr-3">W-L</th>
                        <th className="text-right pb-2">Avg K/D</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-bungie-border/40">
                      {leaderboard.map((e, i) => (
                        <tr key={e.userId} className={i === 0 ? "text-yellow-400" : "text-gray-300"}>
                          <td className="py-2 pr-2 text-gray-500 font-mono text-xs">{i + 1}</td>
                          <td className="py-2 pr-4 font-medium">{i === 0 ? "👑 " : ""}{e.displayName}</td>
                          <td className="py-2 pr-3 text-right">{e.gamesPlayed}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">
                            {e.wins + e.losses > 0 ? (
                              <><span className="text-green-400">{e.wins}</span><span className="text-gray-500">-</span><span className="text-red-400">{e.losses}</span></>
                            ) : <span className="text-gray-500">-</span>}
                          </td>
                          <td className="py-2 text-right">{e.avgKd.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Members */}
        <div className="bg-bungie-surface border border-bungie-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold">Fireteam ({members.length})</h2>
            {captainName && <span className="text-xs text-yellow-400">👑 {captainName}&apos;s turn</span>}
          </div>
          <div className="flex flex-wrap gap-3">
            {members.map((m) => (
              <PlayerCard key={m.id} member={m} />
            ))}
          </div>
          {charactersPicked < 2 && (
            <p className="mt-3 text-xs text-amber-400/90">
              ⚠ Stats won&apos;t track until at least 2 players pick a guardian ({charactersPicked}/2).
            </p>
          )}
        </div>

        {/* Character picker - selecting your guardian is all a player needs to do */}
        {characters.length > 0 && !isSpectator && (
          <div className="bg-bungie-surface border border-bungie-border rounded-xl p-4">
            <h2 className="text-white font-semibold mb-1">Your Character</h2>
            <p className="text-xs text-gray-500 mb-3">
              {selectedCharId
                ? "Your most recent guardian was auto-selected. Tap another to switch."
                : "Pick your guardian. Your selection saves automatically so your stats get tracked."}
            </p>
            <div className="flex gap-3 flex-wrap">
              {[...characters]
                .sort((a, b) => CLASS_ORDER.indexOf(a.classType) - CLASS_ORDER.indexOf(b.classType))
                .map((c) => (
                <button key={c.characterId} onClick={() => handleSelectCharacter(c.characterId)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition flex items-center gap-2 ${selectedCharId === c.characterId ? "border-bungie-blue bg-bungie-blue/20 text-white" : "border-bungie-border text-gray-400 hover:border-gray-500"}`}>
                  <EmblemThumbnail emblemPath={c.emblemPath} classType={c.classType} />
                  {selectedCharId === c.characterId && <span className="text-green-400">✓</span>}
                  {CLASS_NAMES[c.classType] ?? "Guardian"} ·
                  <LightLevelIcon light={c.light} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Captain controls */}
        {isCaptain && (
          <div className="bg-yellow-500/10 border border-yellow-500/40 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-yellow-400 font-semibold">👑 {captainName ? `${captainName}'s Turn` : "Your Turn"}</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggleCaptainLock}
                  title={captainLocked ? "You stay captain every round — click to auto-rotate instead" : "Captain rotates each round — click to lock yourself in as captain"}
                  className={`text-xs px-2.5 py-1 rounded border transition ${captainLocked ? "border-yellow-500 bg-yellow-500/20 text-yellow-300" : "border-bungie-border text-gray-400 hover:border-gray-400"}`}
                >
                  {captainLocked ? "🔒 Stay Captain" : "🔁 Auto-rotate"}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={handleLoadIntersection} disabled={loadingAction !== null}
                className="px-4 py-2 bg-bungie-blue rounded-lg text-sm text-white font-semibold hover:opacity-90 disabled:opacity-50 transition">
                {loadingAction === "intersection" ? "Loading…" : "Load Shared Weapons"}
              </button>
              {intersection && (
                <>
                  <button onClick={() => handleRoll()} disabled={loadingAction !== null || rerollExhausted}
                    className="px-4 py-2 bg-bungie-blue rounded-lg text-sm text-white font-semibold hover:opacity-90 disabled:opacity-50 transition">
                    {loadingAction === "roll" ? "Rolling..." : "🎲 Roll All"}
                  </button>
                  {(["kinetic", "energy", "power"] as WeaponSlot[]).map((slot) => (
                    <button key={slot} onClick={() => handleRoll(slot)} disabled={loadingAction !== null || rerollExhausted}
                      className="px-3 py-2 bg-bungie-surface border border-bungie-border rounded-lg text-xs text-gray-300 hover:border-gray-400 disabled:opacity-50 transition capitalize">
                      Reroll {SLOT_LABELS[slot]}
                    </button>
                  ))}
                </>
              )}
            </div>

            {/* Roll settings: mode, reroll budget, type bans */}
            {intersection && (
              <div className="mt-3 rounded-lg border border-bungie-border bg-bungie-dark/40 p-3 space-y-3">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <label className="flex items-center gap-2 text-xs text-gray-400">
                    Mode
                    <select
                      value={rollMode}
                      onChange={(e) => setRollMode(e.target.value as typeof rollMode)}
                      className="bg-bungie-surface border border-bungie-border rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-bungie-blue"
                    >
                      <option value="normal">Normal</option>
                      <option value="chaos">Chaos</option>
                      <option value="meta">Meta</option>
                    </select>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-gray-400">
                    Rerolls / round
                    <select
                      value={rerollLimit === null ? "inf" : String(rerollLimit)}
                      onChange={(e) => setRerollLimit(e.target.value === "inf" ? null : Number(e.target.value))}
                      className="bg-bungie-surface border border-bungie-border rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-bungie-blue"
                    >
                      <option value="inf">Unlimited</option>
                      <option value="3">3</option>
                      <option value="5">5</option>
                      <option value="10">10</option>
                    </select>
                    {rerollLimit !== null && (
                      <span className={rerollExhausted ? "text-red-400" : "text-gray-300"}>
                        {Math.max(0, rerollLimit - rerollsUsed)} left
                      </span>
                    )}
                  </label>

                  <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={noDupMode}
                      onChange={(e) => setNoDupMode(e.target.checked)}
                      className="accent-bungie-blue"
                    />
                    No duplicates
                  </label>

                  <button
                    onClick={() => setShowRollSettings((v) => !v)}
                    className="text-xs text-gray-400 hover:text-white transition"
                  >
                    {bannedTypes.size > 0 ? `Banned types (${bannedTypes.size})` : "Ban weapon types"} {showRollSettings ? "▲" : "▼"}
                  </button>
                </div>

                {showRollSettings && (
                  <div className="flex flex-wrap gap-1.5 pt-1 border-t border-bungie-border/60">
                    {poolWeaponTypes.length === 0 && (
                      <span className="text-xs text-gray-500">No weapons loaded yet.</span>
                    )}
                    {poolWeaponTypes.map((t) => {
                      const banned = bannedTypes.has(t);
                      return (
                        <button
                          key={t}
                          onClick={() => setBannedTypes((prev) => {
                            const n = new Set(prev);
                            if (n.has(t)) n.delete(t); else n.add(t);
                            return n;
                          })}
                          className={`text-xs px-2 py-1 rounded border transition ${
                            banned
                              ? "border-red-700 bg-red-900/30 text-red-300 line-through"
                              : "border-bungie-border text-gray-300 hover:border-gray-400"
                          }`}
                        >
                          {t}
                        </button>
                      );
                    })}
                    {bannedTypes.size > 0 && (
                      <button
                        onClick={() => setBannedTypes(new Set())}
                        className="text-xs px-2 py-1 rounded text-gray-500 hover:text-gray-300"
                      >
                        Clear bans
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {intersection && (
              <div className="mt-3">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs text-gray-500">Slot mode:</span>
                  {(["kinetic", "energy", "power"] as WeaponSlot[]).map((slot) => {
                    const mode: SlotMode = lockedSlots.has(slot)
                      ? "lock"
                      : wildcardSlots.has(slot)
                      ? "wildcard"
                      : "normal";
                    const cfg = SLOT_MODE_CONFIG[mode];
                    return (
                      <button
                        key={slot}
                        onClick={() => cycleSlotMode(slot)}
                        title={`${SLOT_LABELS[slot]}: ${cfg.label}, click to cycle`}
                        className={`px-2.5 py-1 rounded text-xs border transition flex items-center gap-1.5 ${cfg.cls}`}
                      >
                        <span>{cfg.icon}</span>
                        <span className="font-medium">{SLOT_LABELS[slot]}</span>
                        <span className="opacity-70">· {cfg.label}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-xs text-gray-500">
                  Click a slot to cycle: 🎲 Random → 🔒 Locked (keep on reroll) → 👤 Your own (skipped on apply)
                </p>
              </div>
            )}

            {intersectionError && <div className="mt-2 text-xs text-red-400 break-all">{intersectionError}</div>}
            {effectiveIntersection && (
              <div className="mt-2 text-xs text-gray-400">
                Kinetic: {effectiveIntersection.kinetic.length} · Energy: {effectiveIntersection.energy.length} · Power: {effectiveIntersection.power.length}
              </div>
            )}
          </div>
        )}

        {slots.length > 0 && (
          <LoadoutQueue slots={slots} weaponDetails={weaponDetails} instancePerks={instancePerks}
            collectionHashes={collectionHashes} onApply={handleApply} animKindRef={animKindRef}
            onCancelApply={handleCancelApply} selectedCharId={selectedCharId} loading={loadingAction === "apply"} />
        )}

        {slots.some((s) => s.item_hash !== 0) && (
          <RollDetails
            rolls={rollsData}
            chosenInstances={myChosenInstances}
            onChooseInstance={handleChooseInstance}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            loading={rollsLoading}
            error={rollsError}
            onRetry={fetchRolls}
          />
        )}

        {applyResults.length > 0 && (
          <ApplyStatus results={applyResults} onClear={() => setApplyResults([])} />
        )}

        {showPoolPanel && (
          <div className="xl:hidden">
            {poolHeader(false)}
            {intersection ? weaponBrowser : poolLoadButton(false)}
          </div>
        )}
      </div>

      {showPoolPanel && (intersection == null || showWeaponBrowser) && (
        <div className="hidden xl:flex xl:flex-col w-[420px] shrink-0 sticky top-6 max-h-[calc(100vh-3rem)] gap-2">
          {poolHeader(true)}
          {intersection
            ? (weaponBrowser && <div className="overflow-y-auto">{weaponBrowser}</div>)
            : poolLoadButton(true)}
        </div>
      )}
    </div>
    </>
  );
}
