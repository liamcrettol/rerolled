"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight } from "lucide-react";
import { crucibleGameReportUrl } from "@/lib/crucible/modes";
import type { CrucibleModeBucket, HeadToHeadModeRecord, HeadToHeadSummary } from "@/lib/crucible/types";

const FILTERS: Array<{ key: "all" | CrucibleModeBucket; label: string }> = [
  { key: "all", label: "All" },
  { key: "trials", label: "Trials" },
  { key: "competitive", label: "Competitive" },
  { key: "control", label: "Control" },
  { key: "iron_banner", label: "Iron Banner" },
];

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function recordFor(summary: HeadToHeadSummary, filter: "all" | CrucibleModeBucket): HeadToHeadModeRecord {
  return filter === "all"
    ? summary
    : summary.byMode[filter] ?? { encounters: 0, wins: 0, losses: 0, unknown: 0 };
}

export default function HeadToHeadChip({
  summary,
  opponentName,
}: {
  summary: HeadToHeadSummary;
  opponentName: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; width: number; maxHeight: number; top?: number; bottom?: number }>({ left: 0, width: 420, maxHeight: 480 });
  const [filter, setFilter] = useState<"all" | CrucibleModeBucket>("all");
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const record = recordFor(summary, filter);
  const visibleMeetings = summary.recentMeetings.filter((meeting) => filter === "all" || meeting.mode === filter);
  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  // Small delay so the mouse can travel from the chip to the (detached) popover
  // without it closing in the gap.
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  // The popover is rendered in a portal so it escapes the scrollable match list's
  // overflow clipping. That means fixed viewport positioning, clamped to stay
  // on-screen, flipping above the chip when there is no room below.
  const show = () => {
    cancelClose();
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) {
      setOpen(true);
      return;
    }
    const margin = 8;
    const width = Math.min(420, window.innerWidth - margin * 2);
    const left = Math.min(Math.max(rect.right - width, margin), window.innerWidth - width - margin);
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - margin * 2);
    const spaceAbove = Math.max(0, rect.top - margin * 2);
    const openUp = spaceBelow < 420 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(180, openUp ? spaceAbove : spaceBelow);
    setPos({
      left,
      width,
      maxHeight,
      top: openUp ? undefined : rect.bottom + 8,
      bottom: openUp ? window.innerHeight - rect.top + 8 : undefined,
    });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false);
    };
    // Close on scroll/resize rather than trying to keep a fixed panel glued to a
    // scrolling row.
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  useEffect(() => () => cancelClose(), []);

  const popover = open && typeof document !== "undefined"
    ? createPortal(
        <div
          ref={popoverRef}
          style={{ position: "fixed", left: pos.left, width: pos.width, maxHeight: pos.maxHeight, top: pos.top, bottom: pos.bottom }}
          className="z-[100] flex flex-col overflow-hidden border border-bungie-border bg-bungie-surface"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <div className="flex items-center justify-between gap-4 border-b border-bungie-border px-3 py-2.5">
            <div className="min-w-0">
              <p className="section-label">Head to head</p>
              <p className="mt-1 truncate text-sm font-semibold text-white">{opponentName}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-mono text-sm text-gray-200">
                <span className="text-green-300">{record.wins} W</span>
                <span className="mx-2 text-bungie-border">/</span>
                <span className="text-red-300">{record.losses} L</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-5 border-b border-bungie-border">
            {FILTERS.map((item) => {
              const count = recordFor(summary, item.key).encounters;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  className={`min-w-0 border-r border-bungie-border px-1 py-2 text-[10px] font-bold uppercase tracking-[0.04em] transition last:border-r-0 ${filter === item.key ? "bg-bungie-dark text-white" : "text-gray-400 hover:bg-bungie-dark/55 hover:text-white"}`}
                >
                  <span className="block truncate">{item.label}</span>
                  <span className={`mt-0.5 block font-mono text-[11px] ${filter === item.key ? "text-bungie-blue" : "text-gray-500"}`}>{count}</span>
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex items-center justify-between gap-2 border-b border-bungie-border px-3 py-2">
              <p className="section-label">Recent meetings</p>
              <p className="text-[10px] uppercase tracking-[0.08em] text-gray-400">Last {formatDate(summary.lastPlayedAt)}</p>
            </div>
            {visibleMeetings.length > 0 ? (
              <div className="divide-y divide-bungie-border/60">
                {visibleMeetings.map((meeting) => (
                  <a
                    key={meeting.instanceId}
                    href={crucibleGameReportUrl(meeting.instanceId, meeting.mode)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${meeting.activityName ?? meeting.modeName} game report`}
                    className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2.5 transition hover:bg-bungie-dark/55"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-gray-100">{meeting.activityName ?? meeting.modeName}</p>
                      <p className="mt-0.5 text-[11px] text-gray-400">
                        {meeting.modeName} / {formatDate(meeting.playedAt)}
                      </p>
                    </div>
                    <span className="flex items-center gap-1.5">
                      <span className={`font-mono text-[11px] font-bold ${meeting.viewerWon === true ? "text-green-300" : meeting.viewerWon === false ? "text-red-300" : "text-gray-400"}`}>
                        {meeting.viewerWon === true ? "W" : meeting.viewerWon === false ? "L" : "-"}
                      </span>
                      <ArrowUpRight size={11} className="text-gray-600" />
                    </span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="px-3 py-5 text-center text-xs text-gray-500">No recorded meetings in this playlist.</p>
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div ref={rootRef} className="shrink-0" onMouseEnter={show} onMouseLeave={scheduleClose}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Head-to-head record against ${opponentName}`}
        onClick={() => (open ? setOpen(false) : show())}
        className="flex items-center border border-bungie-border bg-bungie-dark/55 px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none transition hover:border-gray-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-bungie-blue"
      >
        <span className="text-green-300">{summary.wins}</span>
        <span className="mx-0.5 text-gray-600">-</span>
        <span className="text-red-300">{summary.losses}</span>
      </button>
      {popover}
    </div>
  );
}
