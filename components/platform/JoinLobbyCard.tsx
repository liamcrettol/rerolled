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
          <h3 className="mt-2 text-xl font-bold  tracking-normal text-white">Join with a lobby code</h3>
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
              className="h-12 w-full border border-bungie-border bg-bungie-dark px-3 text-center tabular-nums text-sm   text-white slashed-zero placeholder:text-xs placeholder:font-sans placeholder:text-gray-600 focus:border-bungie-blue "
            />
          </label>
          <button
            type="submit"
            disabled={loading || !code.trim()}
            className={`inline-flex h-12 shrink-0 items-center justify-center gap-2 px-5 text-[11px] font-bold   transition-colors ${
              code.trim()
                ? "bg-bungie-blue text-bungie-dark hover:bg-white"
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
            Resume <span className="tabular-nums font-bold text-white slashed-zero">{activeSession.code}</span>
            <span className="ml-2 text-xs text-gray-600">{STATUS_LABELS[activeSession.status]}</span>
          </span>
          <span className="text-[10px] font-bold   text-bungie-blue">Rejoin</span>
        </button>
      )}

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}
