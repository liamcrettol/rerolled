"use client";

import { ArrowRight, KeyRound, RotateCcw } from "lucide-react";
import Spinner from "@/components/Spinner";
import { useJoinLobby, MODE_BASE_PATH } from "@/hooks/useJoinLobby";
import type { Lobby, LobbyMode } from "@/types/lobby";

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
    <div className="panel mt-4 border-l-2 border-l-bungie-blue p-5 sm:p-6">
      <div className="grid items-center gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)]">
        <div>
          <div className="flex items-center gap-2">
            <KeyRound size={18} className="text-bungie-blue" aria-hidden="true" />
            <p className="section-label text-bungie-blue">Already have a fireteam?</p>
          </div>
          <h3 className="mt-2 text-xl font-bold uppercase tracking-wide text-white">Join with a lobby code</h3>
          <p className="mt-1 text-sm text-gray-500">Enter the code shared by your fireteam captain.</p>
        </div>

        <form onSubmit={join} className="flex gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Lobby code</span>
            <input
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              placeholder="LOBBY CODE"
              maxLength={8}
              className="h-12 w-full border border-bungie-border bg-bungie-dark px-3 text-center font-mono text-sm uppercase tracking-widest text-white slashed-zero placeholder:text-xs placeholder:font-sans placeholder:tracking-wider placeholder:text-gray-600 focus:border-bungie-blue focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={loading || !code.trim()}
            className={`inline-flex h-12 shrink-0 items-center justify-center gap-2 px-5 text-[11px] font-bold uppercase tracking-widest transition-colors ${
              code.trim()
                ? "bg-bungie-blue text-white hover:bg-[#26bcf3]"
                : "border border-bungie-border bg-bungie-dark text-gray-500"
            } disabled:opacity-50`}
          >
            {loading ? <Spinner size={12} /> : <ArrowRight size={13} />}
            {loading ? "Joining" : "Join"}
          </button>
        </form>
      </div>

      {activeSession && (
        <button
          onClick={() => router.push(`${MODE_BASE_PATH[activeSession.mode]}/${activeSession.code}`)}
          className="mt-5 flex w-full items-center gap-3 border-t border-bungie-border pt-4 text-left text-sm text-gray-400 transition-colors hover:text-white"
        >
          <RotateCcw size={15} className="shrink-0 text-bungie-blue" aria-hidden="true" />
          <span className="flex-1">
            Resume <span className="font-mono font-bold text-white slashed-zero">{activeSession.code}</span>
            <span className="ml-2 text-xs text-gray-600">{STATUS_LABELS[activeSession.status]}</span>
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-bungie-blue">Rejoin</span>
        </button>
      )}

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}
