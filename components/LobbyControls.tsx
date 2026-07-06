"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PlusCircle } from "lucide-react";
import Spinner from "./Spinner";
import type { Lobby } from "@/types/lobby";

const STATUS_LABELS: Record<Lobby["status"], string> = {
  waiting: "Waiting for players",
  rolling: "Rolling weapons",
  applying: "Applying loadout",
  in_game: "In game",
  done: "Ended",
};

interface Props {
  activeSession?: { code: string; status: Lobby["status"] } | null;
  showCreate?: boolean;
  createHref?: string;
  createLabel?: string;
}

export default function LobbyControls({
  activeSession,
  showCreate = true,
  createHref = "/lobby/new",
  createLabel = "Create PvP Lobby",
}: Props) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState<"join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading("join");
    setError(null);
    try {
      const res = await fetch("/api/lobby/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/lobby/${data.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to join lobby");
      setLoading(null);
    }
  }

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
            onClick={() => router.push(`/lobby/${activeSession.code}`)}
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
        <form onSubmit={handleJoin} className="sm:flex-1 flex gap-2">
          <label className="flex-1 min-w-0">
            <span className="sr-only">Lobby code</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, ""))}
              placeholder="LOBBY CODE"
              maxLength={8}
              className="w-full bg-bungie-dark border border-bungie-border px-3 py-2.5 text-white font-mono text-sm text-center uppercase tracking-widest slashed-zero placeholder:text-gray-600 placeholder:font-sans placeholder:tracking-wider focus:outline-none focus:border-bungie-blue"
            />
          </label>
          <button
            type="submit"
            disabled={loading !== null || !code.trim()}
            className={`text-xs font-bold uppercase tracking-wider px-5 transition-colors inline-flex items-center justify-center gap-2 ${
              code.trim()
                ? "bg-bungie-blue hover:bg-[#26bcf3] text-white"
                : "bg-bungie-dark border border-bungie-border text-gray-500"
            } disabled:opacity-50`}
          >
            {loading === "join" && <Spinner size={14} />}
            {loading === "join" ? "Joining" : "Join"}
          </button>
        </form>
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}
    </div>
  );
}
