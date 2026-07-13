"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Crown, Check, Shield, Swords, Target, Loader2, RotateCcw } from "lucide-react";
import { useLobbySession } from "@/hooks/lobby/useLobbySession";
import { useSupabaseChannel, type SupabaseChannel } from "@/hooks/useSupabaseChannel";
import { createClient } from "@/lib/supabase/client";
import ConfirmDialog from "@/components/lobby/ConfirmDialog";
import WeaponIcon from "@/components/WeaponIcon";
import Spinner from "@/components/Spinner";
import { ENDGAME_KIND_FIRETEAM_SIZE, ARMOR_SLOT_LABELS, type EndgameActivityKind } from "@/lib/endgame/randomizer";
import type { Lobby, LobbyMember } from "@/types/lobby";
import { CLASS_NAMES } from "@/lib/destiny/constants";
import { useCharacters } from "@/hooks/useCharacters";

// Fireteam Endgame Roulette board. Built on useLobbySession for the generic
// lobby skeleton (live members, captain/spectator flags, the current round's
// id and its shared lobby_loadout_slots weapons) - unlike DraftBoard, this
// needs LIVE member updates (ready state, character selection) to gate the
// kind picker by fireteam size and to detect a stale roll after roster
// changes, so the heavier shared hook is the better fit here. The two new
// endgame-specific tables are fetched/subscribed locally, the same direct-
// table-subscription pattern DraftBoard uses for lobby_draft_options.

const KIND_LABELS: Record<EndgameActivityKind, string> = {
  grandmaster: "Grandmaster",
  dungeon: "Dungeon",
  raid: "Raid",
};
const KIND_ORDER: EndgameActivityKind[] = ["grandmaster", "dungeon", "raid"];

type PickStatus = "resolved" | "none_owned" | "fetch_failed" | "missing_character" | "missing_token";

interface EndgameRoundRow {
  round_id: string;
  activity_hash: number;
  activity_name: string;
  activity_kind: EndgameActivityKind;
  exotic_bucket_hash: number;
}

interface EndgamePickRow {
  round_id: string;
  user_id: string;
  status: PickStatus;
  item_hash: number | null;
  icon: string | null;
  name: string | null;
  class_type: number | null;
  slot_label: string | null;
  character_id: string | null;
}

function statusLine(pick: EndgamePickRow, slotLabel: string): string {
  switch (pick.status) {
    case "resolved":
      return pick.name ?? "";
    case "none_owned":
      return `No ${slotLabel} exotic owned`;
    case "fetch_failed":
      return "Couldn't reach Bungie inventory";
    case "missing_token":
      return "Reconnect Bungie to resolve exotic";
    case "missing_character":
      return "Hasn't picked a character";
  }
}

interface Props {
  lobby: Lobby;
  members: LobbyMember[];
  currentUserId: string;
}

export default function EndgameLobbyBoard({ lobby, members: initialMembers, currentUserId }: Props) {
  const { members, slots, roundId, isCaptain } = useLobbySession(lobby, initialMembers, currentUserId, {});

  const supabase = useMemo(() => createClient(), []);
  const [round, setRound] = useState<EndgameRoundRow | null>(null);
  const [picks, setPicks] = useState<EndgamePickRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedKinds, setSelectedKinds] = useState<EndgameActivityKind[]>([]);
  const [showRerollConfirm, setShowRerollConfirm] = useState(false);

  const initialCharacterId = initialMembers.find((member) => member.user_id === currentUserId)?.selected_character_id ?? null;
  const {
    characters,
    selectedCharacterId: characterId,
    setSelectedCharacterId: setCharacterId,
    loading: loadingCharacters,
  } = useCharacters({ initialCharacterId });

  const me = members.find((m) => m.user_id === currentUserId);

  const loadRound = useCallback(async () => {
    if (!roundId) return;
    const [{ data: roundRow }, { data: pickRows }] = await Promise.all([
      supabase.from("lobby_endgame_rounds").select("*").eq("round_id", roundId).maybeSingle(),
      supabase.from("lobby_endgame_exotic_picks").select("*").eq("round_id", roundId),
    ]);
    setRound((roundRow as EndgameRoundRow | null) ?? null);
    setPicks((pickRows as EndgamePickRow[] | null) ?? []);
  }, [supabase, roundId]);

  useEffect(() => {
    setLoading(true);
    // Ensures the shared weapon pool is cached, same call Draft/Roulette make.
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
        .on("postgres_changes", { event: "*", schema: "public", table: "lobby_endgame_rounds" }, () => loadRound())
        .on("postgres_changes", { event: "*", schema: "public", table: "lobby_endgame_exotic_picks" }, () => loadRound());
    },
    [loadRound]
  );
  useSupabaseChannel(`endgame:${lobby.id}`, configureChannel);

  const readyRoster = useMemo(() => members.filter((m) => !m.is_spectator && m.is_ready), [members]);

  // Stale if the roster that produced this roll no longer matches who's
  // actually ready now, or someone's since swapped characters.
  const isStale = useMemo(() => {
    if (!round || picks.length === 0) return false;
    if (readyRoster.length !== picks.length) return true;
    return readyRoster.some((m) => {
      const pick = picks.find((p) => p.user_id === m.user_id);
      return !pick || pick.character_id !== m.selected_character_id;
    });
  }, [round, picks, readyRoster]);

  async function toggleReady() {
    if (!characterId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/lobby/ready", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobbyId: lobby.id, characterId, isReady: !me?.is_ready }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update ready state");
    } finally {
      setBusy(false);
    }
  }

  async function roll(force: boolean) {
    if (!roundId || selectedKinds.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/endgame/lobby/roll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobbyId: lobby.id, roundId, activityKinds: selectedKinds, force }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRound(data.round);
      setPicks(data.picks ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to roll");
    } finally {
      setBusy(false);
      setShowRerollConfirm(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner size={20} />
      </div>
    );
  }

  const readyCount = readyRoster.length;
  const slotLabel = round ? ARMOR_SLOT_LABELS[round.exotic_bucket_hash] ?? "Armor" : "";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="section-label">
          Endgame Fireteam <span className="text-gray-600">·</span>{" "}
          <span className="font-mono slashed-zero text-red-400">{lobby.code}</span>
        </h1>
      </div>

      {error && (
        <div className="border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>
      )}

      {/* Setup: choose character, then ready up. */}
      <div className="panel border-l-2 border-l-red-400 p-5 space-y-4">
        <div>
          <p className="section-label text-red-400 mb-2">Choose Character</p>
          {loadingCharacters ? (
            <div className="flex flex-wrap gap-2" role="status" aria-label="Loading characters">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[34px] w-24 border border-bungie-border bg-bungie-border/20 animate-pulse" />
              ))}
            </div>
          ) : (characters?.length ?? 0) === 0 ? (
            <p className="text-xs text-red-400">No characters found for this Bungie account.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {(characters ?? []).map((c) => {
                const active = characterId === c.characterId;
                return (
                  <button
                    key={c.characterId}
                    type="button"
                    onClick={() => setCharacterId(c.characterId)}
                    className={`flex items-center gap-2 border px-3 py-2 text-xs transition-colors ${
                      active ? "border-red-400 text-white" : "border-bungie-border text-gray-400 hover:border-gray-400"
                    }`}
                  >
                    <span className="font-bold uppercase tracking-wider">{CLASS_NAMES[c.classType] ?? "Guardian"}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={toggleReady}
          disabled={busy || !characterId}
          className={`text-xs font-bold uppercase tracking-wider px-5 py-3 transition-colors disabled:opacity-50 ${
            me?.is_ready ? "border border-bungie-border text-gray-300 hover:border-gray-400" : "bg-red-500 hover:bg-red-400 text-white"
          }`}
        >
          {me?.is_ready ? "Not Ready" : "Ready"}
        </button>
      </div>

      {/* Fireteam roster */}
      <div className="panel p-4">
        <p className="section-label mb-3">Fireteam ({readyCount} ready)</p>
        <div className="flex flex-wrap gap-2">
          {members.filter((m) => !m.is_spectator).map((m) => (
            <div
              key={m.id}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm border ${
                m.is_captain ? "border-yellow-500 bg-yellow-500/10" : "border-bungie-border bg-bungie-dark"
              }`}
            >
              {m.is_captain && <Crown size={12} className="text-yellow-400" aria-hidden="true" />}
              <span className={m.is_ready ? "text-green-400" : "text-gray-300"}>{m.display_name}</span>
              {m.is_ready && <Check size={12} className="text-green-500" aria-hidden="true" />}
            </div>
          ))}
        </div>
      </div>

      {/* Captain-only kind picker + roll */}
      <div className="panel border-l-2 border-l-red-400 p-5 space-y-4">
        <div>
          <p className="section-label text-red-400 mb-2">Roll From</p>
          <div className="flex flex-wrap gap-2">
            {KIND_ORDER.map((kind) => {
              const requiredSize = ENDGAME_KIND_FIRETEAM_SIZE[kind];
              const eligible = requiredSize === readyCount;
              const active = selectedKinds.includes(kind);
              return (
                <button
                  key={kind}
                  type="button"
                  disabled={!isCaptain || !eligible}
                  onClick={() =>
                    setSelectedKinds((current) =>
                      active ? current.filter((k) => k !== kind) : [...current, kind]
                    )
                  }
                  className={`flex flex-col items-center gap-0.5 border px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors disabled:cursor-not-allowed ${
                    active
                      ? "border-red-400 text-white"
                      : eligible
                        ? "border-bungie-border text-gray-400 hover:border-gray-400"
                        : "border-bungie-border/40 text-gray-700"
                  }`}
                >
                  <span>{KIND_LABELS[kind]}</span>
                  <span className="text-[9px] font-normal normal-case tracking-normal text-gray-500">
                    {eligible ? `${requiredSize} players` : `Requires ${requiredSize} ready players`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {isCaptain && (
          <button
            type="button"
            onClick={() => (round ? setShowRerollConfirm(true) : roll(false))}
            disabled={busy || selectedKinds.length === 0}
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-5 py-3 bg-red-500 hover:bg-red-400 text-white transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : round ? <RotateCcw size={14} /> : <Swords size={14} />}
            {busy ? "Rolling…" : round ? "Reroll Round" : "Roll Endgame"}
          </button>
        )}

        {isStale && round && (
          <p className="text-xs text-amber-400">Reroll required after roster changes.</p>
        )}
      </div>

      {round && (
        <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
          <div className="space-y-5">
            <div className="panel border-l-2 border-l-red-400 p-5">
              <div className="flex items-center gap-2 mb-2">
                <Target size={14} className="text-red-400" />
                <p className="section-label text-red-400">Rolled Activity</p>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                {KIND_LABELS[round.activity_kind]}
              </p>
              <h3 className="text-xl font-bold uppercase tracking-wide text-white mt-2">{round.activity_name}</h3>
            </div>

            <div className="panel p-5">
              <p className="section-label mb-3">Rolled Loadout</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {slots.map((weapon) => (
                  <div key={weapon.slot} className="border border-bungie-border bg-bungie-dark/50 p-3 flex items-center gap-3">
                    <WeaponIcon icon={weapon.weapon_icon} name={weapon.weapon_name} size="large" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{weapon.slot}</p>
                      <p className="text-sm font-bold text-white truncate">{weapon.weapon_name}</p>
                      <p className="text-xs text-gray-400">{weapon.weapon_type}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="panel p-5">
            <div className="flex items-center gap-2 mb-3">
              <Shield size={14} className="text-red-400" />
              <p className="section-label text-red-400">Fireteam Exotic · {slotLabel}</p>
            </div>
            <div className="space-y-2">
              {picks.map((pick) => {
                const member = members.find((m) => m.user_id === pick.user_id);
                return (
                  <div key={pick.user_id} className="flex items-center gap-3 border border-bungie-border bg-bungie-dark/50 p-3">
                    {pick.status === "resolved" && pick.icon ? (
                      <WeaponIcon icon={pick.icon} name={pick.name ?? ""} size="large" />
                    ) : (
                      <div className="w-12 h-12 shrink-0 bg-bungie-dark border border-bungie-border flex items-center justify-center text-gray-600">
                        ?
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                        {member?.display_name ?? pick.user_id} · {CLASS_NAMES[pick.class_type ?? -1] ?? ""}
                      </p>
                      <p className={`text-sm font-bold truncate ${pick.status === "resolved" ? "text-white" : "text-amber-400"}`}>
                        {statusLine(pick, slotLabel)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {showRerollConfirm && (
        <ConfirmDialog
          title="Reroll this round?"
          body="This replaces the current shared roll for everyone in the lobby."
          confirmLabel="Reroll"
          tone="danger"
          onConfirm={() => roll(true)}
          onCancel={() => setShowRerollConfirm(false)}
        />
      )}
    </div>
  );
}
