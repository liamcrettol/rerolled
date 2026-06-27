"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { trimBungieName } from "@/lib/utils";
import type { Lobby, LobbyLoadoutSlot, LobbyMember } from "@/types/lobby";

const SLOT_ORDER = ["kinetic", "energy", "power"] as const;
const SLOT_LABELS: Record<string, string> = { kinetic: "Kinetic", energy: "Energy", power: "Power" };

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  waiting: { label: "Waiting", cls: "border-bungie-border text-gray-400" },
  rolling: { label: "Rolling", cls: "border-bungie-blue/50 bg-bungie-blue/10 text-bungie-blue" },
  applying: { label: "Applying", cls: "border-bungie-blue/50 bg-bungie-blue/10 text-bungie-blue" },
  in_game: { label: "● In game", cls: "border-green-600/50 bg-green-900/20 text-green-400" },
  done: { label: "Ended", cls: "border-gray-700 text-gray-500" },
};

export interface WatchMember {
  id: string;
  userId: string;
  displayName: string;
  isCaptain: boolean;
  hasCharacter: boolean;
}

export interface WatchGameStat {
  userId: string;
  displayName: string;
  kills: number;
  deaths: number;
  assists: number;
  won: boolean | null;
}

export interface WatchGame {
  sessionId: string;
  mapName: string | null;
  stats: WatchGameStat[];
}

export interface LobbyLeaderboardEntry {
  userId: string;
  displayName: string;
  gamesPlayed: number;
  totalKills: number;
}

interface Props {
  lobbyId: string;
  code: string;
  initialRoundNumber: number;
  initialRoundId: string | null;
  initialSlots: LobbyLoadoutSlot[];
  initialMembers: WatchMember[];
  initialStatus: string;
  initialLastGame: WatchGame | null;
  initialLobbyLeaderboard: LobbyLeaderboardEntry[];
}

export default function WatchView({
  lobbyId,
  code,
  initialRoundNumber,
  initialRoundId,
  initialSlots,
  initialMembers,
  initialStatus,
  initialLastGame,
  initialLobbyLeaderboard,
}: Props) {
  const supabase = createClient();
  const [roundNumber, setRoundNumber] = useState(initialRoundNumber);
  const [slots, setSlots] = useState<LobbyLoadoutSlot[]>(initialSlots);
  const [members, setMembers] = useState<WatchMember[]>(initialMembers);
  const [status, setStatus] = useState(initialStatus);
  const [lastGame, setLastGame] = useState<WatchGame | null>(initialLastGame);
  const [lobbyLeaderboard, setLobbyLeaderboard] = useState<LobbyLeaderboardEntry[]>(initialLobbyLeaderboard);
  const roundIdRef = useRef<string | null>(initialRoundId);

  const fetchLastGame = useCallback(async () => {
    const { data } = await supabase
      .from("game_sessions")
      .select("id, map_name, played_at, player_game_stats(*)")
      .eq("lobby_id", lobbyId)
      .order("played_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return;
    setLastGame({
      sessionId: data.id,
      mapName: (data.map_name as string | null) ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stats: (data.player_game_stats ?? []).map((s: any) => ({
        userId: s.user_id,
        displayName: s.display_name,
        kills: s.kills,
        deaths: s.deaths,
        assists: s.assists,
        won: s.won,
      })),
    });
  }, [supabase, lobbyId]);

  const fetchLobbyLeaderboard = useCallback(async () => {
    const { data: allGameStats } = await supabase
      .from("game_sessions")
      .select("player_game_stats(user_id, display_name, kills)")
      .eq("lobby_id", lobbyId);

    const lobbyLeaderboardMap = new Map<string, { displayName: string; gamesPlayed: number; totalKills: number }>();
    if (allGameStats) {
      for (const session of allGameStats) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stats = (session as any).player_game_stats || [];
        for (const stat of stats) {
          const existing = lobbyLeaderboardMap.get(stat.user_id);
          if (existing) {
            existing.gamesPlayed += 1;
            existing.totalKills += stat.kills;
          } else {
            lobbyLeaderboardMap.set(stat.user_id, {
              displayName: stat.display_name,
              gamesPlayed: 1,
              totalKills: stat.kills,
            });
          }
        }
      }
    }

    const updated = Array.from(lobbyLeaderboardMap.entries())
      .map(([userId, data]) => ({
        userId,
        displayName: data.displayName,
        gamesPlayed: data.gamesPlayed,
        totalKills: data.totalKills,
      }))
      .sort((a, b) => b.totalKills - a.totalKills);

    setLobbyLeaderboard(updated);
  }, [supabase, lobbyId]);

  useEffect(() => {
    async function loadRound(roundNum: number) {
      const { data: round } = await supabase
        .from("lobby_rounds")
        .select("id")
        .eq("lobby_id", lobbyId)
        .eq("round_number", roundNum)
        .maybeSingle();
      roundIdRef.current = round?.id ?? null;
      if (round) {
        const { data } = await supabase.from("lobby_loadout_slots").select("*").eq("round_id", round.id);
        setSlots(data ?? []);
      } else {
        setSlots([]);
      }
    }

    const toWatchMember = (m: LobbyMember): WatchMember => ({
      id: m.id,
      userId: m.user_id,
      displayName: m.display_name,
      isCaptain: m.is_captain,
      hasCharacter: !!m.selected_character_id,
    });

    const channel = supabase
      .channel(`watch:${lobbyId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lobbies", filter: `id=eq.${lobbyId}` },
        (payload) => {
          const next = payload.new as Lobby;
          setRoundNumber(next.current_round);
          setStatus(next.status);
          loadRound(next.current_round);
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
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lobby_members", filter: `lobby_id=eq.${lobbyId}` },
        (payload) => {
          const m = toWatchMember(payload.new as LobbyMember);
          setMembers((prev) => [...prev.filter((x) => x.id !== m.id), m]);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lobby_members", filter: `lobby_id=eq.${lobbyId}` },
        (payload) => {
          const m = toWatchMember(payload.new as LobbyMember);
          setMembers((prev) => prev.map((x) => (x.id === m.id ? m : x)));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "lobby_members" },
        (payload) => {
          const deletedId = (payload.old as { id?: string }).id;
          if (deletedId) setMembers((prev) => prev.filter((x) => x.id !== deletedId));
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "game_sessions", filter: `lobby_id=eq.${lobbyId}` },
        () => {
          fetchLastGame();
          fetchLobbyLeaderboard();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [lobbyId, supabase, fetchLastGame, fetchLobbyLeaderboard]);

  const ordered = SLOT_ORDER.map((s) => slots.find((x) => x.slot === s));
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.waiting;
  const captain = members.find((m) => m.isCaptain);
  const topPlayer = lastGame && lastGame.stats.length > 0
    ? [...lastGame.stats].sort((a, b) => b.kills - a.kills)[0]
    : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Gun Roulette</h1>
          <p className="text-gray-400 text-sm">
            Watching <span className="font-mono text-bungie-blue font-bold slashed-zero">{code}</span> · Round {roundNumber}
          </p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full border ${badge.cls}`}>{badge.label}</span>
      </div>

      {/* Fireteam */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-white font-semibold text-sm">Fireteam ({members.length})</h2>
          {captain && (
            <span className="text-xs text-yellow-400">👑 {trimBungieName(captain.displayName)}&apos;s turn</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <div
              key={m.id}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border ${
                m.isCaptain ? "border-yellow-500 bg-yellow-500/10" : "border-bungie-border bg-bungie-dark"
              }`}
            >
              {m.isCaptain && <span>👑</span>}
              <span className={m.hasCharacter ? "text-green-400" : "text-gray-300"}>
                {trimBungieName(m.displayName)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Current loadout */}
      <h2 className="text-white font-semibold text-sm mb-2">This round&apos;s loadout</h2>
      <div className="grid grid-cols-3 gap-3">
        {SLOT_ORDER.map((slotName, i) => {
          const slot = ordered[i];
          const isWildcard = slot?.item_hash === 0;
          return (
            <div key={slotName} className="flex flex-col items-center gap-2 rounded-xl p-4 border border-bungie-border bg-bungie-surface">
              <span className="text-xs text-gray-400 uppercase tracking-wider">{SLOT_LABELS[slotName]}</span>
              {isWildcard ? (
                <>
                  <div className="w-16 h-16 rounded bg-purple-500/10 border border-purple-500/40 flex items-center justify-center text-2xl">👤</div>
                  <p className="text-purple-300 text-xs font-semibold">Player&apos;s own</p>
                </>
              ) : slot && slot.weapon_icon ? (
                <>
                  <div className="relative w-16 h-16">
                    <Image src={slot.weapon_icon} alt={slot.weapon_name} fill className="object-cover rounded" unoptimized />
                  </div>
                  <div className="text-center">
                    <p className="text-white text-sm font-semibold leading-tight">{slot.weapon_name}</p>
                    <p className="text-gray-400 text-xs">{slot.weapon_type}</p>
                    <p className="text-gray-500 text-xs">{slot.damage_type}</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded bg-bungie-dark/60 border border-dashed border-bungie-border flex items-center justify-center text-gray-600 text-2xl">🎲</div>
                  <p className="text-gray-500 text-xs">Not rolled yet</p>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Last game result */}
      {lastGame && lastGame.stats.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-white font-semibold text-sm">Last game</h2>
            {lastGame.mapName && <span className="text-xs text-gray-500">{lastGame.mapName}</span>}
          </div>
          <div className="overflow-x-auto rounded-xl border border-bungie-border bg-bungie-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-bungie-border">
                  <th className="text-left p-2 pl-3">Player</th>
                  <th className="text-right p-2">K</th>
                  <th className="text-right p-2">D</th>
                  <th className="text-right p-2 pr-3">A</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bungie-border/40">
                {[...lastGame.stats].sort((a, b) => b.kills - a.kills).map((s) => (
                  <tr key={s.userId} className={s.userId === topPlayer?.userId ? "text-yellow-400" : "text-gray-300"}>
                    <td className="p-2 pl-3 font-medium">
                      {s.userId === topPlayer?.userId ? "👑 " : ""}
                      {trimBungieName(s.displayName)}
                    </td>
                    <td className="p-2 text-right">{s.kills}</td>
                    <td className="p-2 text-right">{s.deaths}</td>
                    <td className="p-2 text-right pr-3">{s.assists}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lobby leaderboard */}
      {lobbyLeaderboard.length > 0 && (
        <div className="mt-6">
          <h2 className="text-white font-semibold text-sm mb-2">Lobby Stats (All Games)</h2>
          <div className="overflow-x-auto rounded-xl border border-bungie-border bg-bungie-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-bungie-border">
                  <th className="text-left p-2 pl-3">#</th>
                  <th className="text-left p-2">Player</th>
                  <th className="text-right p-2">Kills</th>
                  <th className="text-right p-2 pr-3">Games</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bungie-border/40">
                {lobbyLeaderboard.map((entry, i) => (
                  <tr key={entry.userId} className={i === 0 ? "text-yellow-400" : "text-gray-300"}>
                    <td className="p-2 pl-3 text-gray-500 font-mono text-xs">{i + 1}</td>
                    <td className="p-2 font-medium">{trimBungieName(entry.displayName)}</td>
                    <td className="p-2 text-right font-bold text-bungie-blue">{entry.totalKills}</td>
                    <td className="p-2 text-right pr-3 text-xs">{entry.gamesPlayed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-center text-gray-600 text-xs mt-6">Updates live as weapons are rolled.</p>
    </div>
  );
}
