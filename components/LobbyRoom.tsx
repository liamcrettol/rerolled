"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Lobby, LobbyMember, LobbyLoadoutSlot, LobbyRollSettings } from "@/types/lobby";
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
import RollSettingsPopover from "./RollSettingsPopover";
import CaptainSettingsCard from "./CaptainSettingsCard";
import { Shuffle, Zap, SlidersHorizontal, Crown, Check, Copy, X, MoreHorizontal, Lock, User, PanelRightOpen, PanelRightClose, Clock } from "lucide-react";

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
              <td className="py-1.5 pr-4 font-medium">
                <span className="inline-flex items-center gap-1.5">
                  {i === 0 && <Crown size={13} className="shrink-0 text-yellow-400" />}
                  {s.displayName}
                </span>
              </td>
              <td className="py-1.5 pr-3 text-right">{s.kills}</td>
              <td className="py-1.5 pr-3 text-right">{s.assists}</td>
              <td className="py-1.5 pr-3 text-right">{s.deaths}</td>
              <td className="py-1.5 pr-3 text-right">{(s.deaths > 0 ? s.kills / s.deaths : s.kills).toFixed(2)}</td>
              <td className="py-1.5 text-right text-gray-500">{s.games}</td>
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
              <td className="px-3 py-1.5 font-medium">
                <span className="inline-flex items-center gap-1.5">
                  {i === 0 && <Crown size={13} className="shrink-0 text-yellow-400" />}
                  {trimBungieName(s.displayName)}
                </span>
              </td>
              {hasWon && (
                <td className="px-2 py-1.5 text-center">
                  {s.won === true
                    ? <span className="text-[10px] font-bold text-green-400 bg-green-400/10 border border-green-400/30 rounded px-1.5 py-0.5">W</span>
                    : s.won === false
                    ? <span className="text-[10px] font-bold text-red-400 bg-red-400/10 border border-red-400/30 rounded px-1.5 py-0.5">L</span>
                    : <span className="text-gray-500 text-xs">—</span>}
                </td>
              )}
              <td className="px-2 py-1.5 text-right tabular-nums">{s.kills}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{s.deaths}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{s.assists}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-gray-400">{s.kd.toFixed(2)}</td>
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
  // The caller's currently-equipped weapon per slot, captured when the pool
  // loads — used to seed the captain's initial loadout from equipped.
  const [equippedHashes, setEquippedHashes] = useState<Partial<Record<WeaponSlot, number>>>({});
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
  const [rollSettingsOpen, setRollSettingsOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(true);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [minutesToClose, setMinutesToClose] = useState<number | null>(null);
  // Auto-apply: when enabled, equip automatically when the captain clicks Apply.
  // Preference persisted per-device in localStorage.
  const [autoApply, setAutoApply] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("d2r_autoApply") === "true";
  });
  const autoApplyRef = useRef(autoApply);
  useEffect(() => { autoApplyRef.current = autoApply; }, [autoApply]);
  const overflowMenuRef = useRef<HTMLDivElement>(null);

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
  const hasSeeded = useRef(false);
  const prevMemberCount = useRef<number | null>(null);
  const prevRoundIdRef = useRef<string | null>(null);
  // Refs for values needed inside the static Supabase channel callback.
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleApplyRef = useRef<(() => Promise<void>) | null>(null);
  const loadingActionRef = useRef<string | null>(null);
  const isCaptainRef = useRef(false);
  const isSpectatorRef = useRef(false);
  // Clear per-round UI state when the round actually advances (non-null → different non-null).
  useEffect(() => {
    if (roundId && prevRoundIdRef.current && roundId !== prevRoundIdRef.current) {
      setSlots([]);
      setApplyResults([]);
      setLockedSlots(new Set());
      setWildcardSlots(new Set<WeaponSlot>(["power"]));
      setPreferredInstances({});
      hasAutoLoaded.current = false;
      hasSeeded.current = false;
    }
    prevRoundIdRef.current = roundId;
  }, [roundId]);

  const isCaptain = members.find((m) => m.user_id === currentUserId)?.is_captain ?? false;
  const isHost = lobbyData.host_user_id === currentUserId;
  const isSpectator = members.find((m) => m.user_id === currentUserId)?.is_spectator ?? false;
  useEffect(() => { isCaptainRef.current = isCaptain; }, [isCaptain]);
  useEffect(() => { isSpectatorRef.current = isSpectator; }, [isSpectator]);
  useEffect(() => { loadingActionRef.current = loadingAction; }, [loadingAction]);

  // Publish the captain's roll settings onto the lobby row so non-captains can
  // view them read-only (issue #106). The existing `lobbies` realtime
  // subscription rebroadcasts the update to every client. Debounced so a burst
  // of toggles (e.g. banning several types) collapses into a single write.
  // Declared after `isCaptain` so the dependency array isn't a TDZ reference.
  useEffect(() => {
    if (!isCaptain) return;
    const slotModeOf = (s: WeaponSlot): SlotMode =>
      lockedSlots.has(s) ? "lock" : wildcardSlots.has(s) ? "wildcard" : "normal";
    const settings: LobbyRollSettings = {
      mode: rollMode,
      rerollLimit,
      noDup: noDupMode,
      banned: [...bannedTypes],
      slots: {
        kinetic: slotModeOf("kinetic"),
        energy: slotModeOf("energy"),
        power: slotModeOf("power"),
      },
    };
    const t = setTimeout(() => {
      fetch("/api/lobby/roll-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobbyId: lobby.id, settings }),
      }).catch(() => { /* best-effort; non-captains just won't see the latest */ });
    }, 400);
    return () => clearTimeout(t);
  }, [isCaptain, lobby.id, rollMode, rerollLimit, noDupMode, bannedTypes, lockedSlots, wildcardSlots]);
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

  // When the leader ends the session, the lobby status flips to "done" via
  // realtime — redirect all remaining members back to the dashboard.
  useEffect(() => {
    if (lobbyData.status === "done") {
      stopPolling();
      router.push("/dashboard");
      router.refresh();
    }
  }, [lobbyData.status, router, stopPolling]);

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
      .on("broadcast", { event: "captain_apply" }, () => {
        if (!autoApplyRef.current || isSpectatorRef.current || isCaptainRef.current) return;
        if (loadingActionRef.current === "apply") return;
        handleApplyRef.current?.();
      })
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); channelRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobby.id, supabase]);

  useEffect(() => {
    fetch("/api/bungie/characters")
      .then((r) => r.json())
      .then((d) => { if (d.characters) setCharacters(d.characters); });
  }, []);

  // Auto-load the shared pool for any participant (not just the captain) once
  // the round is ready, so a joining member doesn't have to click "Load Shared
  // Weapons" themselves. The captain's load also seeds the initial roll;
  // non-captains just populate their pool view (handleLoadIntersection only
  // rolls when isCaptain).
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
    console.log("[d2r-seed] roster grew", { prev, count, hasSlots: slots.some((s) => s.item_hash !== 0) });
    handleLoadIntersection();
    // Refresh the comparison so the new member's rolls appear without waiting
    // for a slot change (fetchRolls otherwise only re-runs on slot changes).
    if (slots.some((s) => s.item_hash !== 0)) fetchRolls();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, lobbyData.status]);

  // Seed the captain's loadout from their equipped weapons once the pool is
  // loaded and the round has no loadout yet, so the Roll Comparison reflects
  // their equipped guns immediately (Roll All only randomizes). Runs once per
  // round and never overwrites an existing/rolled loadout.
  useEffect(() => {
    // TEMP diagnostics (#141) — remove once the captain seed is confirmed.
    console.log("[d2r-seed] effect run", {
      hasSeeded: hasSeeded.current,
      isCaptain,
      roundId,
      hasIntersection: !!intersection,
      nonZeroSlots: slots.filter((s) => s.item_hash !== 0).length,
      equippedHashes,
    });
    if (hasSeeded.current) return;
    if (!isCaptain || !roundId || !intersection) { console.log("[d2r-seed] blocked: missing captain/round/intersection"); return; }
    if (slots.some((s) => s.item_hash !== 0)) { console.log("[d2r-seed] blocked: slots already populated"); hasSeeded.current = true; return; }
    hasSeeded.current = true;
    const seedRoundId = roundId;
    const keep: Record<string, number> = {};
    for (const s of ["kinetic", "energy", "power"] as WeaponSlot[]) {
      if (equippedHashes[s] != null) keep[s] = equippedHashes[s]!;
    }
    console.log("[d2r-seed] seeding now, keep=", keep);
    (async () => {
      try {
        const res = await fetch("/api/roulette/roll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lobbyId: lobby.id, roundId: seedRoundId, intersection,
            weaponDetails,
            keepSlots: Object.keys(keep).length > 0 ? keep : undefined,
          }),
        });
        const data = await res.json();
        console.log("[d2r-seed] roll response", { ok: res.ok, status: res.status, roll: data.roll, error: data.error });
        if (!res.ok || !data.roll) { hasSeeded.current = false; return; }
        // Reflect the seeded loadout locally right away. The seeding client
        // otherwise waits on the realtime echo of its own write, which is why
        // the captain stayed empty while viewers already saw the comparison.
        const now = new Date().toISOString();
        const seeded: LobbyLoadoutSlot[] = [];
        for (const s of ["kinetic", "energy", "power"] as WeaponSlot[]) {
          const hash = data.roll[s];
          if (!hash) continue;
          const detail = weaponDetails[hash.toString()];
          seeded.push({
            id: `seed-${seedRoundId}-${s}`,
            round_id: seedRoundId,
            slot: s,
            item_hash: hash,
            weapon_name: detail?.name ?? "",
            weapon_icon: detail?.icon ?? "",
            weapon_type: detail?.weaponType ?? "",
            damage_type: detail?.damageType ?? "",
            locked_by_user_id: currentUserId,
            created_at: now,
          });
        }
        console.log("[d2r-seed] applying local slots", seeded.map((s) => ({ slot: s.slot, hash: s.item_hash, name: s.weapon_name })));
        if (seeded.length > 0) {
          setSlots((prev) => {
            // If a real roll already landed (via realtime), don't clobber it.
            if (prev.some((p) => p.item_hash !== 0)) return prev;
            const others = prev.filter((p) => !seeded.some((x) => x.slot === p.slot));
            return [...others, ...seeded];
          });
        }
      } catch (e) {
        console.log("[d2r-seed] error", e);
        hasSeeded.current = false;
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCaptain, roundId, intersection, equippedHashes, slotKey]);

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
        } else {
          // no-op
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

  // Loads the shared pool only. Seeding the captain's loadout from equipped is
  // handled by a dedicated effect below, so the comparison appears as soon as
  // the pool is ready (no Roll All needed) regardless of load/captain timing.
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
      const eq = data.equippedHashes as Record<string, number | null> | undefined;
      const equipped: Partial<Record<WeaponSlot, number>> = {};
      for (const slot of ["kinetic", "energy", "power"] as WeaponSlot[]) {
        if (eq?.[slot] != null) equipped[slot] = eq[slot]!;
      }
      setEquippedHashes(equipped);
    } catch (e) {
      setIntersectionError(e instanceof Error ? e.message : "Network error");
    }
    setLoadingAction(null);
  }, [lobby.id, selectedCharId]);

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

  // Cycle a slot through Random → Locked → Your own → Random.
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
    // Captain's Apply triggers auto-apply for opted-in players via broadcast.
    if (isCaptainRef.current) {
      channelRef.current?.send({ type: "broadcast", event: "captain_apply", payload: {} });
    }
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

  useEffect(() => { handleApplyRef.current = handleApply; }, [handleApply]);

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

  // The shared weapon pool is viewable by every player. The captain can select
  // weapons into the loadout; everyone else gets a read-only browse view.

  // Right column: Fireteam · Your Guardian · Settings stacked in a context card,
  // with the shared Weapon Pool filling the remaining height beneath it. The main
  // loadout column (below) occupies all the space to the left.
  const rightColumn = (
    <aside className="w-full xl:w-80 shrink-0 xl:sticky xl:top-6 xl:h-[calc(100vh-3rem)] flex flex-col">
      {/* Collapse the whole right column to give the loadout full width. */}
      <div className="flex justify-end shrink-0 mb-3">
        <button
          onClick={() => setRightOpen(false)}
          title="Hide panel"
          aria-label="Hide panel"
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 border border-bungie-border/40 rounded-lg px-2 py-1 transition"
        >
          <span className="xl:hidden">Hide</span>
          <PanelRightClose size={15} />
        </button>
      </div>

      {/* Single scrollable area covering the context card + weapon pool. */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 pr-0.5">

      {/* Context: Fireteam + Your Guardian + Settings */}
      <div className="shrink-0 bg-bungie-surface border border-bungie-border/40 rounded-xl">
        {/* Fireteam */}
        <div className="px-3 pt-3 pb-2">
          <p className="text-[10px] uppercase tracking-widest text-gray-600 mb-2">Fireteam</p>
          <div className="space-y-0.5">
            {members.map((m) => (
              <PlayerCard key={m.id} member={m} variant="sidebar" />
            ))}
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
                      onClick={() => handleSelectCharacter(c.characterId)}
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

        {/* Settings: captain edits roll settings; everyone else sees them read-only. */}
        {!isSpectator && (isCaptain ? intersection != null : true) && (
          <>
            <div className="mx-3 h-px bg-bungie-border/40" />
            <div className="px-3 pt-2 pb-3">
              <button
                onClick={() => setRollSettingsOpen((v) => !v)}
                className="w-full flex items-center gap-2 text-[10px] uppercase tracking-widest text-gray-600 hover:text-gray-400 transition mb-2"
              >
                <SlidersHorizontal size={12} className="shrink-0" />
                <span className="flex-1 text-left">{isCaptain ? "Roll Settings" : "Captain's Settings"}</span>
                {isCaptain && bannedTypes.size > 0 && (
                  <span className="text-yellow-500/80 normal-case tracking-normal">{bannedTypes.size} banned</span>
                )}
                <span className="text-[9px]">{rollSettingsOpen ? "▲" : "▼"}</span>
              </button>
              {rollSettingsOpen && (
                isCaptain ? (
                  <RollSettingsPopover
                    inline
                    anchorRef={{ current: null }}
                    onClose={() => {}}
                    rollMode={rollMode}
                    onRollModeChange={setRollMode}
                    rerollLimit={rerollLimit}
                    onRerollLimitChange={setRerollLimit}
                    rerollsUsed={rerollsUsed}
                    noDupMode={noDupMode}
                    onNoDupChange={setNoDupMode}
                    bannedTypes={bannedTypes}
                    onBannedTypesChange={setBannedTypes}
                    poolWeaponTypes={poolWeaponTypes}
                  />
                ) : (
                  <CaptainSettingsCard settings={lobbyData.roll_settings} />
                )
              )}
            </div>
          </>
        )}
      </div>

      {/* Shared Weapon Pool — always open, no internal scroll (parent scrolls). */}
      {!isSpectator && (
        <div className="flex flex-col gap-2 shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold text-sm flex items-center gap-2">
              Weapon Pool
              {effectiveIntersection && (
                <span className="text-xs font-normal text-gray-500">
                  {effectiveIntersection.kinetic.length + effectiveIntersection.energy.length + effectiveIntersection.power.length} shared
                </span>
              )}
            </h2>
            {!isCaptain && (
              <span className="text-[10px] uppercase tracking-wide text-gray-400 border border-bungie-border rounded px-1.5 py-0.5">
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
                currentHashes={Object.fromEntries(slots.filter((s) => s.item_hash !== 0).map((s) => [s.slot, s.item_hash]))}
                currentInstances={preferredInstances}
                onSelectWeapon={(slot, hash, instanceId) => handleSelectWeapon(slot, hash, instanceId)}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
                disabled={loadingAction !== null}
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
                onClick={() => handleLoadIntersection()}
                disabled={loadingAction !== null}
                className="w-full px-4 py-2.5 bg-bungie-blue rounded-lg text-sm text-white font-semibold hover:opacity-90 disabled:opacity-50 transition"
              >
                {loadingAction === "intersection" ? "Loading…" : "Load Shared Weapons"}
              </button>
              {intersectionError && <p className="mt-2 text-xs text-red-400 break-all">{intersectionError}</p>}
            </div>
          ) : (
            <div className="rounded-xl border border-bungie-border/40 bg-bungie-surface p-4">
              <p className="text-sm text-gray-500">
                {loadingAction === "intersection" ? "Loading shared weapons…" : "Roll to load the shared weapon pool."}
              </p>
              {intersectionError && <p className="mt-2 text-xs text-red-400 break-all">{intersectionError}</p>}
            </div>
          )}
        </div>
      )}

      </div>{/* end scrollable wrapper */}
    </aside>
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
                title="Copy lobby code"
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
            <div className="flex items-center gap-2 mt-0.5">
              {(() => {
                const cfg = LOBBY_STATUS_BADGE[lobbyData.status] ?? LOBBY_STATUS_BADGE.waiting;
                return <span className={`text-xs px-2 py-0.5 rounded-full border ${cfg.cls}`}>{cfg.label}</span>;
              })()}
              <span className="text-xs text-gray-500">Round {lobbyData.current_round}</span>
              {isCaptain && (
                <span className="text-xs text-yellow-400 inline-flex items-center gap-1">
                  <Crown size={12} /> Your turn
                </span>
              )}
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
                    onClick={() => { setShowOverflowMenu(false); handleEndSession(); }}
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
        </div>

        {/* Stats panel: Session / History / Leaderboard tabs */}
        <div className="order-6 bg-bungie-surface border border-bungie-border/40 rounded-xl overflow-hidden">
          {/* Post-game dismissible banner */}
          {lastGameStats && lastGameStats.length > 0 && (() => {
            const top = [...lastGameStats].sort((a, b) => b.kills - a.kills)[0];
            const result = lastGameStats.find((s) => s.won != null)?.won ?? null;
            return (
              <div className="flex items-center gap-3 px-4 py-2.5 border-b border-bungie-border/40 bg-green-900/10">
                <span className="text-xs font-semibold text-green-400">
                  {result === true ? "W" : result === false ? "L" : "—"}
                </span>
                <span className="text-xs text-gray-300 flex-1 truncate inline-flex items-center gap-1.5">
                  <Crown size={12} className="shrink-0 text-yellow-400" />
                  {trimBungieName(top.displayName)} · {top.kills}K / {top.deaths}D
                </span>
                <button onClick={() => setLastGameStats(null)} className="text-gray-500 hover:text-gray-300 transition flex items-center"><X size={14} /></button>
              </div>
            );
          })()}

          {/* Tab bar */}
          <div className="flex border-b border-bungie-border/40">
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
                              <p className="text-gray-400 text-xs mt-0.5 truncate inline-flex items-center gap-1.5 max-w-full">
                                <Crown size={12} className="shrink-0 text-yellow-400" />
                                <span className="truncate">{topPlayer.displayName}</span>
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
                          <td className="py-2 pr-4 font-medium">
                            <span className="inline-flex items-center gap-1.5">
                              {i === 0 && <Crown size={13} className="shrink-0 text-yellow-400" />}
                              {e.displayName}
                            </span>
                          </td>
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


        {/* Loadout cards */}
        {slots.length > 0 && (
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
            />
          </div>
        )}

        {/* Action bar: Roll All (captain) + Apply, directly under the loadout. */}
        {!isSpectator && roundId && (
          <div className="order-3 flex items-center gap-3 flex-wrap">
            {isCaptain && (
              <button
                onClick={() => handleRoll()}
                disabled={loadingAction !== null || rerollExhausted || !intersection}
                className="px-5 py-2.5 bg-bungie-blue hover:opacity-90 disabled:opacity-40 text-white font-bold rounded-full transition text-sm inline-flex items-center gap-2"
              >
                <Shuffle size={16} />
                {loadingAction === "roll" ? "Rolling…" : "Roll All"}
              </button>
            )}

            {slots.some((s) => s.item_hash !== 0) && (
              <button
                onClick={handleApply}
                disabled={!selectedCharId || loadingAction === "apply" || slots.length < 3}
                className="px-5 py-2.5 bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white font-bold rounded-full transition text-sm inline-flex items-center gap-2"
              >
                <Zap size={16} />
                {loadingAction === "apply" ? "Applying…" : "Apply"}
              </button>
            )}

            {loadingAction === "apply" && (
              <button
                onClick={handleCancelApply}
                className="px-3 py-2.5 border border-red-800 text-red-400 hover:border-red-600 rounded-full text-sm transition"
              >
                Cancel
              </button>
            )}

            {!selectedCharId && loadingAction !== "apply" && slots.some((s) => s.item_hash !== 0) && (
              <span className="text-xs text-yellow-400">Select a character first</span>
            )}
            {intersectionError && (
              <span className="text-xs text-red-400">{intersectionError}</span>
            )}
            {!intersection && isCaptain && loadingAction === "intersection" && (
              <span className="text-xs text-gray-500 animate-pulse">Loading shared weapons…</span>
            )}
            {slots.some((s) => s.item_hash !== 0) && loadingAction !== "apply" && (
              <span className="text-xs text-gray-600">Must be in orbit or social space</span>
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
                  onClick={() => {
                    const next = !autoApply;
                    setAutoApply(next);
                    localStorage.setItem("d2r_autoApply", next ? "true" : "false");
                  }}
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

        {slots.some((s) => s.item_hash !== 0) && (
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
          <ApplyStatus results={applyResults} onClear={() => setApplyResults([])} />
          </div>
        )}
      </div>

      {rightOpen ? rightColumn : (
        <button
          onClick={() => setRightOpen(true)}
          title="Show panel"
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
