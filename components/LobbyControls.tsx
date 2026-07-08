"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PlusCircle } from "lucide-react";
import Spinner from "./Spinner";
import type { Lobby, LobbyMode } from "@/types/lobby";

const STATUS_LABELS: Record<Lobby["status"], string> = {
  waiting: "Waiting for players",
  rolling: "Rolling weapons",
  applying: "Applying loadout",
  in_game: "In game",
  done: "Ended",
};

// A lobby's mode determines which board it lives on. Rejoin and post-join
// routing derive from this rather than trusting the page's own joinBasePath,
// since your active lobby (or the code you just typed in) isn't necessarily
// the same mode as whatever page you're standing on.
const MODE_BASE_PATH: Record<LobbyMode, string> = {
  roulette: "/lobby",
  draft: "/draft",
  endgame: "/endgame/lobby",
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
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState<"join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading("join");
    setError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2_500);
    try {
      const res = await fetch("/api/lobby/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const base = (data.mode && MODE_BASE_PATH[data.mode as LobbyMode]) || joinBasePath;
      router.push(`${base}/${data.code}`);
    } catch (e) {
      const timedOut = e instanceof DOMException && e.name === "AbortError";
      setError(
        timedOut
          ? "This needs the database, and Supabase is timing out right now. Please try again in a minute."
          : e instanceof Error
            ? e.message
            : "Failed to join lobby"
      );
      setLoading(null);
    } finally {
      window.clearTimeout(timeout);
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
