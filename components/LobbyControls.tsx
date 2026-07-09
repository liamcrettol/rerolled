"use client";

import Link from "next/link";
import { PlusCircle } from "lucide-react";
import Spinner from "./Spinner";
import { useJoinLobby, MODE_BASE_PATH } from "@/hooks/useJoinLobby";
import type { Lobby, LobbyMode } from "@/types/lobby";

const STATUS_LABELS: Record<Lobby["status"], string> = {
  waiting: "Waiting for players",
  rolling: "Rolling weapons",
  applying: "Applying loadout",
  in_game: "In game",
  done: "Ended",
};

interface Props {
  activeSession?: { code: string; status: Lobby["status"]; mode: LobbyMode } | null;
  showCreate?: boolean;
  createHref?: string;
  createLabel?: string;
  /** Fallback join-target if the API response doesn't carry a mode, e.g. "/draft" for Draft mode. */
  joinBasePath?: string;
}

export default function LobbyControls({
  activeSession,
  showCreate = true,
  createHref = "/lobby/new",
  createLabel = "Create Lobby",
  joinBasePath = "/lobby",
}: Props) {
  const { code, onCodeChange, loading, error, join, router } = useJoinLobby(joinBasePath);

  return (
    <div className="space-y-4">
      {activeSession && (
        <div className="panel border-l-2 border-l-bungie-blue p-3 flex items-center justify-between gap-4">
          <p className="text-sm text-gray-300 min-w-0 truncate">
            <span className="font-mono text-bungie-blue font-bold slashed-zero">{activeSession.code}</span>
            <span className="text-gray-500"> · </span>
            {STATUS_LABELS[activeSession.status]}
          </p>
          <button
            onClick={() => router.push(`${MODE_BASE_PATH[activeSession.mode]}/${activeSession.code}`)}
            className="shrink-0 bg-bungie-blue hover:bg-[#26bcf3] text-white text-xs font-bold uppercase tracking-wider px-4 py-2 transition-colors"
          >
            Rejoin
          </button>
        </div>
      )}

      <div className="panel p-4 flex flex-col sm:flex-row sm:items-center gap-4">
        {showCreate && (
          <Link
            href={createHref}
            className="sm:flex-1 bg-bungie-blue hover:bg-[#26bcf3] text-white text-xs font-bold uppercase tracking-wider py-3 px-4 transition-colors text-center inline-flex items-center justify-center gap-2"
          >
            <PlusCircle size={15} />
            {createLabel}
          </Link>
        )}
        <form onSubmit={join} className="sm:flex-1 flex gap-2">
          <label className="flex-1 min-w-0">
            <span className="sr-only">Lobby code</span>
            <input
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
              placeholder="LOBBY CODE"
              maxLength={8}
              className="w-full bg-bungie-dark border border-bungie-border px-3 py-2.5 text-white font-mono text-sm text-center uppercase tracking-widest slashed-zero placeholder:text-gray-600 placeholder:font-sans placeholder:tracking-wider focus:outline-none focus:border-bungie-blue"
            />
          </label>
          <button
            type="submit"
            disabled={loading || !code.trim()}
            className={`text-xs font-bold uppercase tracking-wider px-5 transition-colors inline-flex items-center justify-center gap-2 ${
              code.trim()
                ? "bg-bungie-blue hover:bg-[#26bcf3] text-white"
                : "bg-bungie-dark border border-bungie-border text-gray-500"
            } disabled:opacity-50`}
          >
            {loading && <Spinner size={14} />}
            {loading ? "Joining" : "Join"}
          </button>
        </form>
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}
    </div>
  );
}
