"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "./ui/Card";
import Spinner from "./Spinner";
import { useSupabaseChannel, type SupabaseChannel } from "@/hooks/useSupabaseChannel";
import type { Lobby, LobbyMember } from "@/types/lobby";
import type { WeaponSlot } from "@/types/bungie";

const SLOT_LABELS: Record<WeaponSlot, string> = {
  kinetic: "Kinetic",
  energy: "Energy",
  power: "Power",
};

const CLASS_LABELS: Record<number, string> = { 0: "Titan", 1: "Hunter", 2: "Warlock" };

interface DraftPick {
  forUserId: string;
  pickedByUserId: string;
  slot: WeaponSlot;
  itemHash: number;
}

interface DraftTurn {
  forUserId: string;
  slot: WeaponSlot;
  pickNumber: number;
}

interface WeaponDetail {
  name: string;
  icon: string;
}

interface Props {
  lobby: Lobby;
  members: LobbyMember[];
  currentUserId: string;
}

export default function DraftBoard({ lobby, members, currentUserId }: Props) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [picks, setPicks] = useState<DraftPick[]>([]);
  const [currentTurn, setCurrentTurn] = useState<DraftTurn | null>(null);
  const [complete, setComplete] = useState(false);
  const [pool, setPool] = useState<Record<WeaponSlot, number[]> | null>(null);
  const [weaponDetails, setWeaponDetails] = useState<Record<string, WeaponDetail>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [characters, setCharacters] = useState<{ characterId: string; classType: number }[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>("");

  const nameFor = useCallback(
    (userId: string) => members.find((m) => m.user_id === userId)?.display_name ?? userId,
    [members]
  );

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/draft/lobby/${lobby.id}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed to load draft");
      return;
    }
    setSessionId(data.sessionId);
    setPicks(data.picks ?? []);
    setCurrentTurn(data.currentTurn ?? null);
    setComplete(Boolean(data.complete));
  }, [lobby.id]);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    if (!sessionId || pool) return;
    fetch("/api/roulette/intersection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lobbyId: lobby.id }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.intersection) setPool(data.intersection);
        if (data.weaponDetails) setWeaponDetails(data.weaponDetails);
      })
      .catch(() => setError("Failed to load the shared weapon pool"));
  }, [sessionId, pool, lobby.id]);

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

  const configureChannel = useCallback(
    (channel: SupabaseChannel) => {
      channel
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "draft_picks" },
          () => refresh()
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "draft_sessions", filter: `lobby_id=eq.${lobby.id}` },
          () => refresh()
        );
    },
    [lobby.id, refresh]
  );
  useSupabaseChannel(`draft:${lobby.id}`, configureChannel);

  async function startDraft() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/draft/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobbyId: lobby.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start draft");
    } finally {
      setBusy(false);
    }
  }

  async function pick(itemHash: number) {
    if (!sessionId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/draft/${sessionId}/pick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemHash }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to pick");
    } finally {
      setBusy(false);
    }
  }

  async function applyLoadout() {
    if (!sessionId || !selectedCharacterId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/draft/${sessionId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: selectedCharacterId }),
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

  const myLoadoutComplete =
    complete &&
    picks.filter((p) => p.forUserId === currentUserId).length === 3;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="text-xs font-bold uppercase tracking-wider text-gray-400">
        Draft &middot; <span className="font-mono text-bungie-blue">{lobby.code}</span>
      </h1>

      {error && <div className="text-red-400 text-sm">{error}</div>}

      {!sessionId && (
        <Card className="p-6 text-center space-y-4">
          <p className="text-sm text-gray-300">
            Pick and ban weapons for each other from the fireteam&rsquo;s shared pool.
          </p>
          <button
            onClick={startDraft}
            disabled={busy}
            className="bg-bungie-blue hover:bg-[#26bcf3] text-white text-xs font-bold uppercase tracking-wider px-5 py-2.5 disabled:opacity-50"
          >
            {busy ? "Starting…" : "Start Draft"}
          </button>
        </Card>
      )}

      {sessionId && !complete && currentTurn && (
        <Card className="p-4 space-y-3">
          <p className="text-sm text-gray-300">
            {currentTurn.forUserId === currentUserId ? (
              <>Waiting for a teammate to draft your <b>{SLOT_LABELS[currentTurn.slot]}</b>.</>
            ) : (
              <>
                Pick <b>{SLOT_LABELS[currentTurn.slot]}</b> for{" "}
                <b>{nameFor(currentTurn.forUserId)}</b>.
              </>
            )}
          </p>
          {currentTurn.forUserId !== currentUserId && pool && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(pool[currentTurn.slot] ?? []).map((hash) => (
                <button
                  key={hash}
                  onClick={() => pick(hash)}
                  disabled={busy}
                  className="text-left text-xs bg-bungie-dark border border-bungie-border px-3 py-2 hover:border-bungie-blue transition-colors disabled:opacity-50"
                >
                  {weaponDetails[hash.toString()]?.name ?? hash}
                </button>
              ))}
              {(pool[currentTurn.slot] ?? []).length === 0 && (
                <p className="text-xs text-gray-500 col-span-full">Loading the shared pool…</p>
              )}
            </div>
          )}
        </Card>
      )}

      <Card className="p-4">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-3">
          Fireteam Picks
        </h2>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 uppercase tracking-wider text-left">
              <th className="pb-2 font-normal">Player</th>
              {(["kinetic", "energy", "power"] as WeaponSlot[]).map((slot) => (
                <th key={slot} className="pb-2 font-normal">{SLOT_LABELS[slot]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.user_id} className="border-t border-bungie-border/40">
                <td className="py-2 text-gray-300">{m.display_name}</td>
                {(["kinetic", "energy", "power"] as WeaponSlot[]).map((slot) => {
                  const p = picks.find((x) => x.forUserId === m.user_id && x.slot === slot);
                  return (
                    <td key={slot} className="py-2 text-gray-400">
                      {p ? weaponDetails[p.itemHash.toString()]?.name ?? p.itemHash : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {myLoadoutComplete && (
        <Card className="p-4 space-y-3">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
            Apply Your Draft
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
