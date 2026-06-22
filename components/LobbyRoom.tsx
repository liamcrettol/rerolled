"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Lobby, LobbyMember, LobbyLoadoutSlot } from "@/types/lobby";
import type { DestinyCharacter } from "@/types/bungie";
import type { WeaponSlot } from "@/types/bungie";
import LoadoutQueue from "./LoadoutQueue";
import ApplyStatus from "./ApplyStatus";
import SignOutButton from "./SignOutButton";
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

export default function LobbyRoom({
  lobby,
  initialMembers,
  currentUserId,
  bungieMembershipType,
  bungieMembershipId,
}: Props) {
  const supabase = createClient();
  const [members, setMembers] = useState<LobbyMember[]>(initialMembers);
  const [characters, setCharacters] = useState<DestinyCharacter[]>([]);
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [slots, setSlots] = useState<LobbyLoadoutSlot[]>([]);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [intersection, setIntersection] = useState<Record<WeaponSlot, number[]> | null>(null);
  const [weaponDetails, setWeaponDetails] = useState<Record<string, { name: string; icon: string; weaponType: string; damageType: string }>>({});
  const [applyResults, setApplyResults] = useState<ApplyResult[]>([]);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [intersectionError, setIntersectionError] = useState<string | null>(null);

  const isCaptain = members.find((m) => m.user_id === currentUserId)?.is_captain ?? false;
  const me = members.find((m) => m.user_id === currentUserId);

  // Load characters on mount
  useEffect(() => {
    fetch("/api/bungie/characters")
      .then((r) => r.json())
      .then((d) => {
        if (d.characters) setCharacters(d.characters);
      });
  }, []);

  // Load current round's slots
  useEffect(() => {
    async function loadCurrentRound() {
      const { data: round } = await supabase
        .from("lobby_rounds")
        .select("id")
        .eq("lobby_id", lobby.id)
        .eq("round_number", lobby.current_round)
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
  }, [lobby.id, lobby.current_round, supabase]);

  // Supabase realtime subscriptions
  useEffect(() => {
    const channel = supabase
      .channel(`lobby:${lobby.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lobby_members", filter: `lobby_id=eq.${lobby.id}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setMembers((prev) => [...prev.filter((m) => m.id !== (payload.new as LobbyMember).id), payload.new as LobbyMember]);
          } else if (payload.eventType === "UPDATE") {
            setMembers((prev) => prev.map((m) => m.id === (payload.new as LobbyMember).id ? payload.new as LobbyMember : m));
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lobby_loadout_slots" },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const s = payload.new as LobbyLoadoutSlot;
            setSlots((prev) => [...prev.filter((x) => x.slot !== s.slot), s]);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [lobby.id, supabase]);

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
        body: JSON.stringify({ lobbyId: lobby.id }),
      });
      const data = await res.json();
      if (data.intersection) {
        setIntersection(data.intersection);
        setWeaponDetails(data.weaponDetails ?? {});
      } else {
        setIntersectionError(data.error ?? "Unknown error loading shared weapons");
      }
    } catch (e) {
      setIntersectionError(e instanceof Error ? e.message : "Network error");
    }
    setLoadingAction(null);
  }, [lobby.id]);

  const handleRoll = useCallback(async (rerollSlot?: WeaponSlot) => {
    if (!intersection || !roundId) return;
    setLoadingAction("roll");
    const keepSlots = rerollSlot
      ? Object.fromEntries(slots.filter((s) => s.slot !== rerollSlot).map((s) => [s.slot, s.item_hash]))
      : undefined;
    await fetch("/api/roulette/roll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId: lobby.id, roundId, intersection, weaponDetails, rerollSlot, keepSlots }),
    });
    setLoadingAction(null);
  }, [intersection, roundId, lobby.id, slots, weaponDetails]);

  const handleApply = useCallback(async () => {
    if (!selectedCharId || !roundId) return;
    setLoadingAction("apply");
    const res = await fetch("/api/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId: lobby.id, roundId, characterId: selectedCharId }),
    });
    const data = await res.json();
    if (data.results) setApplyResults(data.results);
    setLoadingAction(null);
  }, [selectedCharId, roundId, lobby.id]);

  void bungieMembershipType;
  void bungieMembershipId;

  return (
    <div className="space-y-6">
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
          <span className="text-sm text-gray-400">Round {lobby.current_round}</span>
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
              <span className={m.is_ready ? "text-green-400" : "text-gray-300"}>
                {m.display_name}
              </span>
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
              isReady
                ? "bg-green-700 text-white"
                : "bg-bungie-blue text-white hover:opacity-90"
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
                    Reroll {slot}
                  </button>
                ))}
              </>
            )}
          </div>
          {intersectionError && (
            <div className="mt-2 text-xs text-red-400 break-all">
              Error: {intersectionError}
            </div>
          )}
          {intersection && (
            <div className="mt-2 text-xs text-gray-400">
              Shared pool — Kinetic: {intersection.kinetic.length} · Energy:{" "}
              {intersection.energy.length} · Power: {intersection.power.length}
            </div>
          )}
        </div>
      )}

      {/* Loadout queue */}
      {slots.length > 0 && (
        <LoadoutQueue
          slots={slots}
          weaponDetails={weaponDetails}
          onApply={handleApply}
          selectedCharId={selectedCharId}
          loading={loadingAction === "apply"}
        />
      )}

      {/* Apply results */}
      {applyResults.length > 0 && <ApplyStatus results={applyResults} />}
    </div>
  );
}
