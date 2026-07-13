"use client";

import { KeyRound } from "lucide-react";
import Spinner from "@/components/Spinner";
import { useJoinLobby, MODE_BASE_PATH } from "@/hooks/useJoinLobby";
import type { Lobby, LobbyMode } from "@/types/lobby";

// The fourth cell of the home mode grid. Deliberately shaped like a ModeCard
// (same panel frame, accent rail, eyebrow, title) so it reads as a peer of the
// three modes rather than a stray form bolted to the bottom of the page.

const STATUS_LABELS: Record<Lobby["status"], string> = {
  waiting: "Waiting for players",
  rolling: "Rolling weapons",
  applying: "Applying loadout",
  in_game: "In game",
  done: "Ended",
};

export default function JoinLobbyCard({
  activeSession,
}: {
  activeSession?: { code: string; status: Lobby["status"]; mode: LobbyMode } | null;
}) {
  const { code, onCodeChange, loading, error, join, router } = useJoinLobby();

  return (
    <div className="panel border-l-2 border-l-bungie-blue flex min-h-[168px] flex-col p-5">
      <div className="flex items-center gap-2 min-w-0">
        <KeyRound size={18} className="shrink-0 text-bungie-blue" aria-hidden="true" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-bungie-blue">Fireteam</p>
      </div>
      <h3 className="mt-3 max-w-[14ch] text-xl font-bold uppercase leading-tight tracking-wide text-white">
        Enter a code or rejoin
      </h3>

      {activeSession && (
        <button
          onClick={() => router.push(`${MODE_BASE_PATH[activeSession.mode]}/${activeSession.code}`)}
          className="mt-3 flex w-full items-center justify-between gap-2 bg-bungie-blue px-3 py-2.5 text-white transition-colors hover:bg-[#26bcf3]"
        >
          <span className="font-mono text-sm font-bold slashed-zero">{activeSession.code}</span>
          <span className="text-[11px] font-bold uppercase tracking-widest shrink-0">Rejoin</span>
        </button>
      )}
      {activeSession && (
        <p className="mt-1 text-[11px] text-gray-500 truncate">{STATUS_LABELS[activeSession.status]}</p>
      )}

      <form onSubmit={join} className="mt-auto flex gap-2 pt-4">
        <label className="flex-1 min-w-0">
          <span className="sr-only">Lobby code</span>
          <input
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            placeholder="LOBBY CODE"
            maxLength={8}
            className="w-full border border-bungie-border bg-bungie-dark px-2 py-2.5 text-center font-mono text-sm uppercase tracking-widest text-white slashed-zero placeholder:text-xs placeholder:font-sans placeholder:tracking-wider placeholder:text-gray-600 focus:border-bungie-blue focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={loading || !code.trim()}
          className={`inline-flex shrink-0 items-center justify-center gap-1.5 px-4 text-[11px] font-bold uppercase tracking-widest transition-colors ${
            code.trim()
              ? "bg-bungie-blue hover:bg-[#26bcf3] text-white"
              : "bg-bungie-dark border border-bungie-border text-gray-500"
          } disabled:opacity-50`}
        >
          {loading && <Spinner size={12} />}
          {loading ? "Joining" : "Join"}
        </button>
      </form>

      {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}
    </div>
  );
}
