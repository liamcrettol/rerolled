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
import PostMatchSummary from "./PostMatchSummary";
import type { ApplyResult } from "@/types/lobby";

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
  const [showPostMatch, setShowPostMatch] = useState(false);
  const applyAbortRef = useRef<AbortController | null>(null);
  const roundIdRef = useRef<string | null>(null);
  useEffect(() => { roundIdRef.current = roundId; }, [roundId]);
  const hasAutoLoaded = useRef(false);

  const isCaptain = members.find((m) => m.user_id === currentUserId)?.is_captain ?? false;

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

  useEffect(() => {
    const channel = supabase
      .channel(`lobby:${lobby.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lobbies", filter: `id=eq.${lobby.id}` },
        (payload) => {
          setLobbyData(payload.new as Lobby);
          if ((payload.new as Lobby).status === "done") setShowPostMatch(true);
        }
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
  }, [lobby.id, supabase]);

  const handleLeave = useCallback(async () => {
    await fetch("/api/lobby/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId: lobby.id }),
    });
    router.push("/dashboard");
    router.refresh();
  }, [lobby.id, router]);

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
        setIntersectionError(data.error ?? "Unknown error loading shared weapons");
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
            lobbyId: lobby.id,
            roundId,
            intersection: data.intersection,
            weaponDetails: data.weaponDetails ?? {},
            keepSlots: Object.keys(equipped).length > 0 ? equipped : undefined,
          }),
        });
      }
    } catch (e) {
      setIntersectionError(e instanceof Error ? e.message : "Network error");
    }
    setLoadingAction(null);
  }, [lobby.id, isCaptain, slots.length, roundId]);

  const toggleLock = useCallback((slot: WeaponSlot) => {
    setLockedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });
    setWildcardSlots((prev) => { const n = new Set(prev); n.delete(slot); return n; });
  }, []);

  const toggleWildcard = useCallback((slot: WeaponSlot) => {
    setWildcardSlots((prev) => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });
    setLockedSlots((prev) => { const n = new Set(prev); n.delete(slot); return n; });
  }, []);

  const handleRoll = useCallback(async (rerollSlot?: WeaponSlot) => {
    if (!intersection || !roundId) return;
    setLoadingAction("roll");

    let keepSlots: Record<string, number> | undefined;
    const effectiveWildcards = new Set(wildcardSlots);
    if (rerollSlot) effectiveWildcards.delete(rerollSlot);

    if (rerollSlot) {
      keepSlots = Object.fromEntries(
        slots
          .filter((s) => s.slot !== rerollSlot && !effectiveWildcards.has(s.slot as WeaponSlot))
          .map((s) => [s.slot, s.item_hash])
      );
    } else {
      const kept = slots.filter((s) => {
        if (effectiveWildcards.has(s.slot as WeaponSlot)) return false;
        if (s.slot === "power") return true;
        return lockedSlots.has(s.slot as WeaponSlot);
      });
      if (kept.length > 0) {
        keepSlots = Object.fromEntries(kept.map((s) => [s.slot, s.item_hash]));
      }
    }

    await fetch("/api/roulette/roll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lobbyId: lobby.id,
        roundId,
        intersection,
        weaponDetails,
        rerollSlot,
        keepSlots,
        wildcardSlots: Array.from(effectiveWildcards),
      }),
    });
    setLoadingAction(null);
  }, [intersection, roundId, lobby.id, slots, weaponDetails, lockedSlots]);

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
      if (data.results) setApplyResults(data.results);
    } catch (e) {
      if ((e as Error).name !== "AbortError") console.error("Apply failed:", e);
    }
    applyAbortRef.current = null;
    setLoadingAction(null);
  }, [selectedCharId, roundId, lobby.id]);

  const handleCancelApply = useCallback(() => {
    applyAbortRef.current?.abort();
    applyAbortRef.current = null;
    setLoadingAction(null);
  }, []);

  const handleSelectWeapon = useCallback(async (slot: WeaponSlot, hash: number, instanceId?: string) => {
    if (!intersection || !roundId) return;
    setLoadingAction("roll");

    if (instanceId) {
      setPreferredInstances((prev) => ({ ...prev, [slot]: instanceId }));
    } else {
      setPreferredInstances((prev) => { const n = { ...prev }; delete n[slot]; return n; });
    }

    const keep: Partial<Record<WeaponSlot, number>> = {};
    for (const s of slots) {
      if (s.item_hash !== 0) keep[s.slot as WeaponSlot] = s.item_hash;
    }
    keep[slot] = hash;

    await fetch("/api/roulette/roll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId: lobby.id, roundId, intersection, weaponDetails, keepSlots: keep }),
    });
    setLoadingAction(null);
  }, [intersection, roundId, lobby.id, slots, weaponDetails]);

  const handleNextRound = useCallback(async () => {
    setLoadingAction("next-round");
    const res = await fetch("/api/lobby/next-round", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId: lobby.id }),
    });
    if (res.ok) {
      setSlots([]);
      setApplyResults([]);
      setLockedSlots(new Set());
      setWildcardSlots(new Set());
      setPreferredInstances({});
      hasAutoLoaded.current = false;
    }
    setLoadingAction(null);
  }, [lobby.id]);

  const handleEndGame = useCallback(async () => {
    setLoadingAction("end-game");
    await fetch("/api/lobby/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId: lobby.id }),
    });
    setShowPostMatch(true);
    setLoadingAction(null);
  }, [lobby.id]);

  void bungieMembershipType;
  void bungieMembershipId;

  const weaponBrowser = isCaptain && intersection ? (
    <WeaponPool
      intersection={intersection}
      weaponDetails={weaponDetails}
      instancePerks={instancePerks}
      collectionHashes={collectionHashes}
      currentHashes={Object.fromEntries(
        slots.filter((s) => s.item_hash !== 0).map((s) => [s.slot, s.item_hash])
      )}
      onSelectWeapon={(slot, hash, instanceId) => handleSelectWeapon(slot, hash, instanceId)}
      disabled={loadingAction !== null}
    />
  ) : null;

  // Game ended — show post-match screen
  if (showPostMatch || lobbyData.status === "done") {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Game Over</h1>
          <button
            onClick={() => { router.push("/dashboard"); router.refresh(); }}
            className="px-3 py-1.5 text-sm text-gray-400 border border-bungie-border rounded-lg hover:text-white hover:border-gray-500 transition"
          >
            Back to Dashboard
          </button>
        </div>
        <PostMatchSummary lobbyId={lobby.id} />
      </div>
    );
  }

  return (
    <div className="flex gap-6 items-start">
      {/* ── Left: main lobby content ── */}
      <div className="flex-1 min-w-0 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Lobby</h1>
            <p className="text-gray-400 text-sm">
              Code:{" "}
              <span className="font-mono text-bungie-blue font-bold tracking-widest">
                {lobby.code}
              </span>{" "}
              — share this with your fireteam
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">Round {lobbyData.current_round}</span>
            <button
              onClick={handleLeave}
              className="px-3 py-1.5 text-sm text-gray-400 border border-bungie-border rounded-lg hover:text-red-400 hover:border-red-800 transition"
            >
              Leave
            </button>
            <SignOutButton />
          </div>
        </div>

        {/* Members */}
        <div className="bg-bungie-surface border border-bungie-border rounded-xl p-4">
          <h2 className="text-white font-semibold mb-3">Fireteam ({members.length})</h2>
          <div className="flex flex-wrap gap-3">
            {members.map((m) => (
              <div
                key={m.id}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border ${
                  m.is_captain ? "border-yellow-500 bg-yellow-500/10" : "border-bungie-border bg-bungie-dark"
                }`}
              >
                {m.is_captain && <span title="Captain">👑</span>}
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
                <button
                  key={c.characterId}
                  onClick={() => setSelectedCharId(c.characterId)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition ${
                    selectedCharId === c.characterId
                      ? "border-bungie-blue bg-bungie-blue/20 text-white"
                      : "border-bungie-border text-gray-400 hover:border-gray-500"
                  }`}
                >
                  {CLASS_NAMES[c.classType] ?? "Guardian"} · {c.light}
                </button>
              ))}
            </div>
            <button
              onClick={handleReady}
              disabled={!selectedCharId || loadingAction === "ready"}
              className={`mt-3 px-4 py-2 rounded-lg text-sm font-semibold transition ${
                isReady ? "bg-green-700 text-white" : "bg-bungie-blue text-white hover:opacity-90"
              } disabled:opacity-50`}
            >
              {loadingAction === "ready" ? "…" : isReady ? "✓ Ready" : "Mark Ready"}
            </button>
          </div>
        )}

        {/* Captain controls */}
        {isCaptain && (
          <div className="bg-yellow-500/10 border border-yellow-500/40 rounded-xl p-4">
            <h2 className="text-yellow-400 font-semibold mb-3">👑 Captain Controls</h2>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleLoadIntersection}
                disabled={loadingAction !== null}
                className="px-4 py-2 bg-bungie-surface border border-bungie-border rounded-lg text-sm text-white hover:border-gray-400 disabled:opacity-50 transition"
              >
                {loadingAction === "intersection" ? "Loading…" : "Load Shared Weapons"}
              </button>
              {intersection && (
                <>
                  <button
                    onClick={() => handleRoll()}
                    disabled={loadingAction !== null}
                    className="px-4 py-2 bg-bungie-blue rounded-lg text-sm text-white font-semibold hover:opacity-90 disabled:opacity-50 transition"
                  >
                    {loadingAction === "roll" ? "Rolling…" : "🎲 Roll All"}
                  </button>
                  {(["kinetic", "energy", "power"] as WeaponSlot[]).map((slot) => (
                    <button
                      key={slot}
                      onClick={() => handleRoll(slot)}
                      disabled={loadingAction !== null}
                      className="px-3 py-2 bg-bungie-surface border border-bungie-border rounded-lg text-xs text-gray-300 hover:border-gray-400 disabled:opacity-50 transition capitalize"
                    >
                      Reroll {SLOT_LABELS[slot]}
                    </button>
                  ))}
                </>
              )}
            </div>

            {intersection && (
              <div className="mt-3 flex flex-wrap gap-2 items-center">
                <span className="text-xs text-gray-500">Slot options:</span>
                {(["kinetic", "energy", "power"] as WeaponSlot[]).map((slot) => {
                  const locked = lockedSlots.has(slot);
                  const wildcard = wildcardSlots.has(slot);
                  const hasRoll = slots.some((s) => s.slot === slot);
                  return (
                    <span key={slot} className="flex items-center gap-1">
                      <button
                        onClick={() => toggleLock(slot)}
                        disabled={!hasRoll}
                        title={`Lock ${SLOT_LABELS[slot]} to current rolled weapon`}
                        className={`px-2 py-1 rounded text-xs border transition ${
                          locked ? "border-yellow-500 bg-yellow-500/20 text-yellow-300" : "border-bungie-border text-gray-400 hover:border-gray-400"
                        } disabled:opacity-30`}
                      >
                        {locked ? "🔒" : "🔓"}
                      </button>
                      <button
                        onClick={() => toggleWildcard(slot)}
                        title={`? — everyone keeps their own ${SLOT_LABELS[slot].toLowerCase()} weapon`}
                        className={`px-2 py-1 rounded text-xs border transition ${
                          wildcard ? "border-purple-500 bg-purple-500/20 text-purple-300" : "border-bungie-border text-gray-400 hover:border-gray-400"
                        }`}
                      >
                        ❓
                      </button>
                      <span className="text-xs text-gray-500">{SLOT_LABELS[slot]}</span>
                    </span>
                  );
                })}
              </div>
            )}

            {intersectionError && (
              <div className="mt-2 text-xs text-red-400 break-all">Error: {intersectionError}</div>
            )}
            {intersection && (
              <div className="mt-2 text-xs text-gray-400">
                Shared pool — Kinetic: {intersection.kinetic.length} · Energy:{" "}
                {intersection.energy.length} · Power: {intersection.power.length}
              </div>
            )}

            {/* Round management */}
            <div className="mt-4 pt-4 border-t border-yellow-500/20 flex flex-wrap gap-3">
              <button
                onClick={handleNextRound}
                disabled={loadingAction !== null}
                className="px-4 py-2 bg-bungie-surface border border-bungie-border rounded-lg text-sm text-white hover:border-gray-400 disabled:opacity-50 transition"
              >
                {loadingAction === "next-round" ? "Advancing…" : "▶ Next Round"}
              </button>
              <button
                onClick={handleEndGame}
                disabled={loadingAction !== null}
                className="px-4 py-2 bg-red-900/40 border border-red-800/60 rounded-lg text-sm text-red-300 hover:bg-red-900/60 disabled:opacity-50 transition"
              >
                {loadingAction === "end-game" ? "Ending…" : "⏹ End Game"}
              </button>
            </div>
          </div>
        )}

        {/* Loadout queue */}
        {slots.length > 0 && (
          <LoadoutQueue
            slots={slots}
            weaponDetails={weaponDetails}
            onApply={handleApply}
            onCancelApply={handleCancelApply}
            selectedCharId={selectedCharId}
            loading={loadingAction === "apply"}
          />
        )}

        {/* Apply results */}
        {applyResults.length > 0 && <ApplyStatus results={applyResults} />}

        {/* Weapon browser — mobile fallback */}
        {weaponBrowser && <div className="xl:hidden">{weaponBrowser}</div>}
      </div>

      {/* ── Right: sticky weapon browser sidebar ── */}
      {weaponBrowser && (
        <div className="hidden xl:block w-[420px] shrink-0 sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto">
          {weaponBrowser}
        </div>
      )}
    </div>
  );
}
