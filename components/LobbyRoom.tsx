"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Lobby, LobbyMember, LobbyLoadoutSlot } from "@/types/lobby";
import type { DestinyCharacter } from "@/types/bungie";
import type { WeaponSlot } from "@/types/bungie";
import LoadoutQueue from "./LoadoutQueue";
import ApplyStatus from "./ApplyStatus";
import SignOutButton from "./SignOutButton";
import WeaponPool from "./WeaponPool";
import type { ApplyResult } from "@/types/lobby";

interface PlayerStat {
  userId: string;
  displayName: string;
  kills: number;
  deaths: number;
  assists: number;
  kd: number;
  rouletteWeaponKills: number;
}

interface RoundRecord {
  sessionId: string;
  playedAt: string;
  roundNum: number;
  stats: PlayerStat[];
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
const SLOT_LABELS: Record<WeaponSlot, string> = { kinetic: "Kinetic", energy: "Energy", power: "Power" };
const POLL_INTERVAL_MS = 30_000;

// Per-slot mode cycle: Random → Locked → Your own.
type SlotMode = "normal" | "lock" | "wildcard";
const SLOT_MODE_CONFIG: Record<SlotMode, { icon: string; label: string; cls: string }> = {
  normal: { icon: "🎲", label: "Random", cls: "border-bungie-border text-gray-400 hover:border-gray-400" },
  lock: { icon: "🔒", label: "Locked", cls: "border-yellow-500 bg-yellow-500/20 text-yellow-300" },
  wildcard: { icon: "👤", label: "Your own", cls: "border-purple-500 bg-purple-500/20 text-purple-300" },
};

function StatsTable({ stats }: { stats: PlayerStat[] }) {
  const sorted = [...stats].sort((a, b) => b.rouletteWeaponKills - a.rouletteWeaponKills);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-500 text-xs border-b border-bungie-border">
            <th className="text-left pb-2 pr-4">Player</th>
            <th className="text-right pb-2 pr-3">Roulette Kills</th>
            <th className="text-right pb-2 pr-3">K</th>
            <th className="text-right pb-2 pr-3">D</th>
            <th className="text-right pb-2 pr-3">A</th>
            <th className="text-right pb-2">K/D</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-bungie-border/40">
          {sorted.map((s, i) => (
            <tr key={s.userId} className={i === 0 ? "text-yellow-400" : "text-gray-300"}>
              <td className="py-2 pr-4 font-medium">{i === 0 ? "👑 " : ""}{s.displayName}</td>
              <td className="py-2 pr-3 text-right font-bold text-bungie-blue">{s.rouletteWeaponKills}</td>
              <td className="py-2 pr-3 text-right">{s.kills}</td>
              <td className="py-2 pr-3 text-right">{s.deaths}</td>
              <td className="py-2 pr-3 text-right">{s.assists}</td>
              <td className="py-2 text-right">{s.kd.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [slots, setSlots] = useState<LobbyLoadoutSlot[]>([]);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [intersection, setIntersection] = useState<Record<WeaponSlot, number[]> | null>(null);
  const [weaponDetails, setWeaponDetails] = useState<Record<string, {
    name: string; icon: string; weaponType: string; damageType: string;
    tierType: number; tierName: string; ammoType: string; stats: Record<string, number>;
  }>>({});
  const [instancePerks, setInstancePerks] = useState<Record<string, Array<{ instanceId: string; perks: string[]; location: string; characterId?: string }>>>({});
  const [collectionHashes, setCollectionHashes] = useState<Set<number>>(new Set());
  const [preferredInstances, setPreferredInstances] = useState<Partial<Record<WeaponSlot, string>>>({});
  const [applyResults, setApplyResults] = useState<ApplyResult[]>([]);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [intersectionError, setIntersectionError] = useState<string | null>(null);
  const [lockedSlots, setLockedSlots] = useState<Set<WeaponSlot>>(new Set());
  const [wildcardSlots, setWildcardSlots] = useState<Set<WeaponSlot>>(new Set());
  // Current game results (prominent card, clears when captain rolls)
  const [lastGameStats, setLastGameStats] = useState<PlayerStat[] | null>(null);
  // All past rounds for scrollable history
  const [roundHistory, setRoundHistory] = useState<RoundRecord[]>([]);
  const [expandedRound, setExpandedRound] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const applyAbortRef = useRef<AbortController | null>(null);
  const roundIdRef = useRef<string | null>(null);
  useEffect(() => { roundIdRef.current = roundId; }, [roundId]);
  const hasAutoLoaded = useRef(false);

  const isCaptain = members.find((m) => m.user_id === currentUserId)?.is_captain ?? false;

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setPolling(false);
  }, []);

  const fetchHistory = useCallback(async () => {
    const res = await fetch(`/api/stats/history?lobbyId=${lobby.id}`);
    const data = await res.json();
    if (data.rounds) {
      setRoundHistory(data.rounds);
      // Auto-expand the most recent round when history loads/updates
      if (data.rounds.length > 0) {
        setExpandedRound((prev) => prev ?? data.rounds[data.rounds.length - 1].sessionId);
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
        fetchHistory();
        // Reset local round state — server already advanced the round
        setSlots([]);
        setApplyResults([]);
        setLockedSlots(new Set());
        setWildcardSlots(new Set());
        setPreferredInstances({});
        hasAutoLoaded.current = false;
      }
    } catch {
      // ignore poll errors
    }
  }, [lobby.id, stopPolling, fetchHistory]);

  const startPolling = useCallback(() => {
    if (pollTimerRef.current) return;
    setPolling(true);
    detectGameEnd();
    pollTimerRef.current = setInterval(detectGameEnd, POLL_INTERVAL_MS);
  }, [detectGameEnd]);

  useEffect(() => () => stopPolling(), [stopPolling]);

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
        { event: "*", schema: "public", table: "lobby_members", filter: `lobby_id=eq.${lobby.id}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setMembers((prev) => [...prev.filter((m) => m.id !== (payload.new as LobbyMember).id), payload.new as LobbyMember]);
          } else if (payload.eventType === "UPDATE") {
            setMembers((prev) => prev.map((m) => m.id === (payload.new as LobbyMember).id ? payload.new as LobbyMember : m));
          } else if (payload.eventType === "DELETE") {
            setMembers((prev) => prev.filter((m) => m.id !== (payload.old as LobbyMember).id));
          }
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
            if (roundIdRef.current && s.round_id !== roundIdRef.current) return;
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

  const prevCharId = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedCharId || !isCaptain || !roundId) return;
    if (selectedCharId === prevCharId.current) return;
    prevCharId.current = selectedCharId;
    if (!hasAutoLoaded.current) return;
    handleLoadIntersection();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCharId]);

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
        if (existingSlots) setSlots(existingSlots);
      }
    }
    loadCurrentRound();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobby.id, lobbyData.current_round]);

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

  const handleReady = useCallback(async () => {
    if (!selectedCharId) return;
    setLoadingAction("ready");
    await fetch("/api/lobby/ready", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId: lobby.id, characterId: selectedCharId, isReady: !isReady }),
    });
    setIsReady(!isReady);
    setLoadingAction(null);
  }, [selectedCharId, isReady, lobby.id]);

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

  // Cycle a slot through Random → 🔒 Locked → 👤 Your own → Random.
  // Locked = keep this shared weapon on Roll All. Your own = skip slot on apply
  // (each player keeps their own equipped weapon).
  const cycleSlotMode = useCallback((slot: WeaponSlot) => {
    const locked = lockedSlots.has(slot);
    const wildcard = wildcardSlots.has(slot);
    if (!locked && !wildcard) {
      setLockedSlots((prev) => new Set(prev).add(slot));
    } else if (locked) {
      setLockedSlots((prev) => { const n = new Set(prev); n.delete(slot); return n; });
      setWildcardSlots((prev) => new Set(prev).add(slot));
    } else {
      setWildcardSlots((prev) => { const n = new Set(prev); n.delete(slot); return n; });
    }
  }, [lockedSlots, wildcardSlots]);

  const handleRoll = useCallback(async (rerollSlot?: WeaponSlot) => {
    if (!intersection || !roundId) return;
    setLoadingAction("roll");
    // Dismiss the prominent last-game card when captain rolls for a new round
    setLastGameStats(null);
    const effectiveWildcards = new Set(wildcardSlots);
    if (rerollSlot) effectiveWildcards.delete(rerollSlot);
    let keepSlots: Record<string, number> | undefined;
    if (rerollSlot) {
      keepSlots = Object.fromEntries(
        slots.filter((s) => s.slot !== rerollSlot && !effectiveWildcards.has(s.slot as WeaponSlot)).map((s) => [s.slot, s.item_hash])
      );
    } else {
      const kept = slots.filter((s) => {
        if (effectiveWildcards.has(s.slot as WeaponSlot)) return false;
        if (s.slot === "power") return true;
        return lockedSlots.has(s.slot as WeaponSlot);
      });
      if (kept.length > 0) keepSlots = Object.fromEntries(kept.map((s) => [s.slot, s.item_hash]));
    }
    await fetch("/api/roulette/roll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId: lobby.id, roundId, intersection, weaponDetails, rerollSlot, keepSlots, wildcardSlots: Array.from(effectiveWildcards) }),
    });
    setLoadingAction(null);
  }, [intersection, roundId, lobby.id, slots, weaponDetails, lockedSlots, wildcardSlots]);

  const handleApply = useCallback(async () => {
    if (!selectedCharId || !roundId) return;
    const controller = new AbortController();
    applyAbortRef.current = controller;
    setLoadingAction("apply");
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobbyId: lobby.id, roundId, characterId: selectedCharId, preferredInstances }),
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
  }, [selectedCharId, roundId, lobby.id, preferredInstances, startPolling]);

  const handleCancelApply = useCallback(() => {
    applyAbortRef.current?.abort();
    applyAbortRef.current = null;
    setLoadingAction(null);
  }, []);

  const handleSelectWeapon = useCallback(async (slot: WeaponSlot, hash: number, instanceId?: string) => {
    if (!intersection || !roundId) return;
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
    await fetch("/api/roulette/roll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId: lobby.id, roundId, intersection, weaponDetails, keepSlots: keep }),
    });
    setLoadingAction(null);
  }, [intersection, roundId, lobby.id, slots, weaponDetails]);

  void bungieMembershipType;
  void bungieMembershipId;

  const weaponBrowser = isCaptain && intersection ? (
    <WeaponPool
      intersection={intersection}
      weaponDetails={weaponDetails}
      instancePerks={instancePerks}
      collectionHashes={collectionHashes}
      currentHashes={Object.fromEntries(slots.filter((s) => s.item_hash !== 0).map((s) => [s.slot, s.item_hash]))}
      onSelectWeapon={(slot, hash, instanceId) => handleSelectWeapon(slot, hash, instanceId)}
      disabled={loadingAction !== null}
    />
  ) : null;

  return (
    <div className="flex gap-6 items-start">
      <div className="flex-1 min-w-0 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Lobby</h1>
            <p className="text-gray-400 text-sm">
              Code: <span className="font-mono text-bungie-blue font-bold tracking-widest">{lobby.code}</span>
              {" "}· share with your fireteam
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">Round {lobbyData.current_round}</span>
            {polling && (
              <span className="text-xs text-green-500 animate-pulse">● watching</span>
            )}
            <button onClick={handleLeave} className="px-3 py-1.5 text-sm text-gray-400 border border-bungie-border rounded-lg hover:text-red-400 hover:border-red-800 transition">
              Leave
            </button>
            <SignOutButton />
          </div>
        </div>

        {/* Last game results — prominent inline card, clears when captain rolls */}
        {lastGameStats && (
          <div className="bg-bungie-surface border border-bungie-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-semibold">Last Game</h2>
              <button onClick={() => setLastGameStats(null)} className="text-gray-600 hover:text-gray-300 text-sm leading-none">✕</button>
            </div>
            <StatsTable stats={lastGameStats} />
          </div>
        )}

        {/* Members */}
        <div className="bg-bungie-surface border border-bungie-border rounded-xl p-4">
          <h2 className="text-white font-semibold mb-3">Fireteam ({members.length})</h2>
          <div className="flex flex-wrap gap-3">
            {members.map((m) => (
              <div key={m.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border ${m.is_captain ? "border-yellow-500 bg-yellow-500/10" : "border-bungie-border bg-bungie-dark"}`}>
                {m.is_captain && <span>👑</span>}
                <span className={m.is_ready ? "text-green-400" : "text-gray-300"}>{m.display_name}</span>
                {m.is_ready && <span className="text-green-500 text-xs">✓</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Character picker */}
        {characters.length > 0 && (
          <div className="bg-bungie-surface border border-bungie-border rounded-xl p-4">
            <h2 className="text-white font-semibold mb-3">Your Character</h2>
            <div className="flex gap-3 flex-wrap">
              {characters.map((c) => (
                <button key={c.characterId} onClick={() => setSelectedCharId(c.characterId)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition ${selectedCharId === c.characterId ? "border-bungie-blue bg-bungie-blue/20 text-white" : "border-bungie-border text-gray-400 hover:border-gray-500"}`}>
                  {CLASS_NAMES[c.classType] ?? "Guardian"} · {c.light}
                </button>
              ))}
            </div>
            <button onClick={handleReady} disabled={!selectedCharId || loadingAction === "ready"}
              className={`mt-3 px-4 py-2 rounded-lg text-sm font-semibold transition ${isReady ? "bg-green-700 text-white" : "bg-bungie-blue text-white hover:opacity-90"} disabled:opacity-50`}>
              {loadingAction === "ready" ? "..." : isReady ? "✓ Ready" : "Mark Ready"}
            </button>
          </div>
        )}

        {/* Captain controls */}
        {isCaptain && (
          <div className="bg-yellow-500/10 border border-yellow-500/40 rounded-xl p-4">
            <h2 className="text-yellow-400 font-semibold mb-3">👑 Captain</h2>
            <div className="flex flex-wrap gap-3">
              <button onClick={handleLoadIntersection} disabled={loadingAction !== null}
                className="px-4 py-2 bg-bungie-surface border border-bungie-border rounded-lg text-sm text-white hover:border-gray-400 disabled:opacity-50 transition">
                {loadingAction === "intersection" ? "Loading..." : "Load Shared Weapons"}
              </button>
              {intersection && (
                <>
                  <button onClick={() => handleRoll()} disabled={loadingAction !== null}
                    className="px-4 py-2 bg-bungie-blue rounded-lg text-sm text-white font-semibold hover:opacity-90 disabled:opacity-50 transition">
                    {loadingAction === "roll" ? "Rolling..." : "🎲 Roll All"}
                  </button>
                  {(["kinetic", "energy", "power"] as WeaponSlot[]).map((slot) => (
                    <button key={slot} onClick={() => handleRoll(slot)} disabled={loadingAction !== null}
                      className="px-3 py-2 bg-bungie-surface border border-bungie-border rounded-lg text-xs text-gray-300 hover:border-gray-400 disabled:opacity-50 transition capitalize">
                      Reroll {SLOT_LABELS[slot]}
                    </button>
                  ))}
                </>
              )}
            </div>

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
                        title={`${SLOT_LABELS[slot]}: ${cfg.label} — click to cycle`}
                        className={`px-2.5 py-1 rounded text-xs border transition flex items-center gap-1.5 ${cfg.cls}`}
                      >
                        <span>{cfg.icon}</span>
                        <span className="font-medium">{SLOT_LABELS[slot]}</span>
                        <span className="opacity-70">· {cfg.label}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-xs text-gray-600">
                  Click a slot to cycle: 🎲 Random → 🔒 Locked (keep on reroll) → 👤 Your own (skipped on apply)
                </p>
              </div>
            )}

            {intersectionError && <div className="mt-2 text-xs text-red-400 break-all">{intersectionError}</div>}
            {intersection && (
              <div className="mt-2 text-xs text-gray-400">
                Kinetic: {intersection.kinetic.length} · Energy: {intersection.energy.length} · Power: {intersection.power.length}
              </div>
            )}
          </div>
        )}

        {slots.length > 0 && (
          <LoadoutQueue slots={slots} weaponDetails={weaponDetails} onApply={handleApply}
            onCancelApply={handleCancelApply} selectedCharId={selectedCharId} loading={loadingAction === "apply"} />
        )}

        {applyResults.length > 0 && <ApplyStatus results={applyResults} />}

        {/* Round history — scrollable accordion of all past games */}
        {roundHistory.length > 0 && (
          <div className="bg-bungie-surface border border-bungie-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-bungie-border">
              <h2 className="text-white font-semibold text-sm">Round History</h2>
            </div>
            <div className="divide-y divide-bungie-border/40">
              {[...roundHistory].reverse().map((round) => {
                const isOpen = expandedRound === round.sessionId;
                const topPlayer = [...round.stats].sort((a, b) => b.rouletteWeaponKills - a.rouletteWeaponKills)[0];
                return (
                  <div key={round.sessionId}>
                    <button
                      onClick={() => setExpandedRound(isOpen ? null : round.sessionId)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-bungie-dark/40 transition"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-gray-400 text-sm font-medium">Round {round.roundNum}</span>
                        {topPlayer && (
                          <span className="text-xs text-gray-500">
                            👑 {topPlayer.displayName} · {topPlayer.rouletteWeaponKills} kills
                          </span>
                        )}
                      </div>
                      <span className="text-gray-600 text-xs">{isOpen ? "▲" : "▼"}</span>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4">
                        <StatsTable stats={round.stats} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {weaponBrowser && <div className="xl:hidden">{weaponBrowser}</div>}
      </div>

      {weaponBrowser && (
        <div className="hidden xl:block w-[420px] shrink-0 sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto">
          {weaponBrowser}
        </div>
      )}
    </div>
  );
}
