"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "./ui/Card";
import Spinner from "./Spinner";
import WeaponIcon from "./WeaponIcon";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseChannel, type SupabaseChannel } from "@/hooks/useSupabaseChannel";
import type { Lobby, LobbyMember, LobbyLoadoutSlot } from "@/types/lobby";
import type { WeaponSlot } from "@/types/bungie";

const SLOT_ORDER: WeaponSlot[] = ["kinetic", "energy", "power"];
const SLOT_LABELS: Record<WeaponSlot, string> = {
  kinetic: "Kinetic",
  energy: "Energy",
  power: "Power",
};
const CLASS_LABELS: Record<number, string> = { 0: "Titan", 1: "Hunter", 2: "Warlock" };

interface DraftOption {
  position: number;
  itemHash: number;
  name: string;
  icon: string;
  weaponType: string;
  damageType: string;
}

interface Props {
  lobby: Lobby;
  members: LobbyMember[];
  currentUserId: string;
}

export default function DraftBoard({ lobby, members, currentUserId }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const isCaptain = lobby.captain_user_id === currentUserId;

  const [roundId, setRoundId] = useState<string | null>(null);
  const [slots, setSlots] = useState<LobbyLoadoutSlot[]>([]);
  const [options, setOptions] = useState<Partial<Record<WeaponSlot, DraftOption[]>>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [characters, setCharacters] = useState<{ characterId: string; classType: number }[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>("");

  const nameFor = useCallback(
    (userId: string) => members.find((m) => m.user_id === userId)?.display_name ?? userId,
    [members]
  );

  const loadRound = useCallback(async () => {
    const { data: round } = await supabase
      .from("lobby_rounds")
      .select("id")
      .eq("lobby_id", lobby.id)
      .eq("round_number", lobby.current_round)
      .single();
    if (!round) return;
    setRoundId(round.id);

    const [{ data: existingSlots }, { data: existingOptions }] = await Promise.all([
      supabase.from("lobby_loadout_slots").select("*").eq("round_id", round.id),
      supabase.from("lobby_draft_options").select("*").eq("round_id", round.id),
    ]);
    setSlots(existingSlots ?? []);

    const grouped: Partial<Record<WeaponSlot, DraftOption[]>> = {};
    for (const row of existingOptions ?? []) {
      const slot = row.slot as WeaponSlot;
      grouped[slot] = [
        ...(grouped[slot] ?? []),
        { position: row.position, itemHash: row.item_hash, name: row.weapon_name, icon: row.weapon_icon, weaponType: row.weapon_type, damageType: row.damage_type },
      ].sort((a, b) => a.position - b.position);
    }
    setOptions(grouped);
  }, [supabase, lobby.id, lobby.current_round]);

  useEffect(() => {
    // Ensures the shared weapon pool is cached (lobby_pools) so the reveal has
    // something to draw from — same call the roulette flow makes.
    fetch("/api/roulette/intersection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId: lobby.id }),
    }).catch(() => setError("Failed to load the shared weapon pool"));
    loadRound().finally(() => setLoading(false));
  }, [lobby.id, loadRound]);

  const configureChannel = useCallback(
    (channel: SupabaseChannel) => {
      channel
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "lobby_draft_options" },
          () => loadRound()
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "lobby_loadout_slots" },
          () => loadRound()
        );
    },
    [loadRound]
  );
  useSupabaseChannel(`draft:${lobby.id}`, configureChannel);

  const committedSlots = new Set(slots.map((s) => s.slot));
  const complete = SLOT_ORDER.every((s) => committedSlots.has(s));
  const activeSlot = SLOT_ORDER.find((s) => !committedSlots.has(s)) ?? null;

  useEffect(() => {
    if (!complete) return;
    fetch("/api/bungie/characters")
      .then((res) => res.json())
      .then((data) => {
        if (data.characters?.length) {
          setCharacters(data.characters);
          setSelectedCharacterId(data.characters[0].characterId);
        }
      })
      .catch(() => {});
  }, [complete]);

  async function reveal(slot: WeaponSlot) {
    if (!roundId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/draft/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobbyId: lobby.id, roundId, slot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await loadRound();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reveal options");
    } finally {
      setBusy(false);
    }
  }

  async function pick(slot: WeaponSlot, itemHash: number) {
    if (!roundId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/draft/pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobbyId: lobby.id, roundId, slot, itemHash }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await loadRound();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to pick");
    } finally {
      setBusy(false);
    }
  }

  async function applyLoadout() {
    if (!roundId || !selectedCharacterId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobbyId: lobby.id, roundId, characterId: selectedCharacterId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply loadout");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner size={20} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="text-xs font-bold uppercase tracking-wider text-gray-400">
        Draft &middot; <span className="font-mono text-bungie-blue">{lobby.code}</span>
      </h1>

      {error && <div className="text-red-400 text-sm">{error}</div>}

      {activeSlot && (
        <Card className="p-6 space-y-4 text-center">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
            {SLOT_LABELS[activeSlot]} &middot; Choose One
          </h2>

          {(options[activeSlot]?.length ?? 0) === 0 && (
            <div className="py-6">
              {isCaptain ? (
                <button
                  onClick={() => reveal(activeSlot)}
                  disabled={busy}
                  className="bg-bungie-blue hover:bg-[#26bcf3] text-white text-xs font-bold uppercase tracking-wider px-6 py-3 disabled:opacity-50"
                >
                  {busy ? "Revealing…" : `Reveal ${SLOT_LABELS[activeSlot]} Options`}
                </button>
              ) : (
                <p className="text-sm text-gray-400">
                  Waiting for <b>{nameFor(lobby.captain_user_id)}</b> to reveal {SLOT_LABELS[activeSlot]} options…
                </p>
              )}
            </div>
          )}

          {(options[activeSlot]?.length ?? 0) > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {options[activeSlot]!.map((opt) => (
                <button
                  key={opt.itemHash}
                  onClick={() => isCaptain && pick(activeSlot, opt.itemHash)}
                  disabled={busy || !isCaptain}
                  className="group flex flex-col items-center gap-2 bg-bungie-dark border border-bungie-border p-4 hover:border-bungie-blue hover:scale-[1.03] transition-all disabled:hover:scale-100 disabled:hover:border-bungie-border"
                >
                  <WeaponIcon icon={opt.icon} name={opt.name} size="large" />
                  <span className="text-sm font-bold text-white">{opt.name}</span>
                  <span className="text-[10px] uppercase tracking-wider text-gray-500">{opt.weaponType}</span>
                </button>
              ))}
              {!isCaptain && (
                <p className="col-span-full text-xs text-gray-500">
                  {nameFor(lobby.captain_user_id)} is choosing…
                </p>
              )}
            </div>
          )}
        </Card>
      )}

      <Card className="p-4">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-3">
          Fireteam Loadout
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {SLOT_ORDER.map((slot) => {
            const committed = slots.find((s) => s.slot === slot);
            return (
              <div key={slot} className="flex flex-col items-center gap-2 border border-bungie-border/40 p-3">
                <span className="text-[10px] uppercase tracking-wider text-gray-500">{SLOT_LABELS[slot]}</span>
                {committed ? (
                  <>
                    <WeaponIcon icon={committed.weapon_icon} name={committed.weapon_name} size="medium" />
                    <span className="text-xs text-gray-300 text-center">{committed.weapon_name}</span>
                  </>
                ) : (
                  <span className="text-xs text-gray-600">—</span>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {complete && (
        <Card className="p-4 space-y-3">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
            Apply Loadout
          </h2>
          {characters.length > 0 && (
            <select
              value={selectedCharacterId}
              onChange={(e) => setSelectedCharacterId(e.target.value)}
              className="bg-bungie-dark border border-bungie-border text-white text-xs px-3 py-2"
            >
              {characters.map((c) => (
                <option key={c.characterId} value={c.characterId}>
                  {CLASS_LABELS[c.classType] ?? "Guardian"}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={applyLoadout}
            disabled={busy || !selectedCharacterId}
            className="bg-bungie-blue hover:bg-[#26bcf3] text-white text-xs font-bold uppercase tracking-wider px-5 py-2.5 disabled:opacity-50"
          >
            {busy ? "Applying…" : "Apply Loadout"}
          </button>
        </Card>
      )}
    </div>
  );
}
