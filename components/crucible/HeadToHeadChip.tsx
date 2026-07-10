"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Crosshair } from "lucide-react";
import { crucibleModeLabel } from "@/lib/crucible/modes";
import type { CrucibleModeBucket, HeadToHeadModeRecord, HeadToHeadSummary } from "@/lib/crucible/types";

const FILTERS: Array<{ key: "all" | CrucibleModeBucket; label: string }> = [
  { key: "all", label: "All" },
  { key: "trials", label: "Trials" },
  { key: "competitive", label: "Comp" },
  { key: "control", label: "Control" },
  { key: "iron_banner", label: "Banner" },
];

function formatDate(value: string | null) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function recordFor(summary: HeadToHeadSummary, filter: "all" | CrucibleModeBucket): HeadToHeadModeRecord {
  return filter === "all"
    ? summary
    : summary.byMode[filter] ?? { encounters: 0, wins: 0, losses: 0, unknown: 0 };
}

export default function HeadToHeadChip({
  summary,
  opponentName,
  syncStatus,
}: {
  summary: HeadToHeadSummary;
  opponentName: string;
  syncStatus: "idle" | "queued" | "syncing" | "complete" | "failed";
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number }>({ left: 0, width: 352 });
  const [filter, setFilter] = useState<"all" | CrucibleModeBucket>("all");
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const record = recordFor(summary, filter);
  const meetings = summary.recentMeetings.filter((meeting) => filter === "all" || meeting.mode === filter);
  const importing = syncStatus === "queued" || syncStatus === "syncing";

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
    const width = Math.min(352, window.innerWidth - margin * 2);
    const left = Math.min(Math.max(rect.right - width, margin), window.innerWidth - width - margin);
    const openUp = rect.bottom + 380 > window.innerHeight && rect.top > 380;
    setPos({
      left,
      width,
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
          style={{ position: "fixed", left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
          className="z-[100] border border-bungie-blue/35 bg-[#10151c] shadow-[0_20px_60px_rgba(0,0,0,0.65)]"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <div className="relative overflow-hidden border-b border-bungie-border/70 px-4 py-3">
            <div className="absolute inset-y-0 left-0 w-1 bg-bungie-blue" />
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="section-label text-bungie-blue">Head To Head</p>
                <p className="mt-1 truncate text-sm font-semibold uppercase tracking-wide text-white">{opponentName}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-2xl leading-none text-white">{record.wins}<span className="mx-1 text-gray-600">-</span>{record.losses}</p>
                <p className="mt-1 text-[9px] uppercase tracking-[0.2em] text-gray-500">Your record</p>
              </div>
            </div>
          </div>

          <div className="flex gap-1 overflow-x-auto border-b border-bungie-border/55 px-3 py-2">
            {FILTERS.map((item) => {
              const count = recordFor(summary, item.key).encounters;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  className={`shrink-0 border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] transition ${filter === item.key ? "border-bungie-blue/60 bg-bungie-blue/15 text-bungie-blue" : "border-transparent text-gray-500 hover:border-bungie-border hover:text-gray-300"}`}
                >
                  {item.label} {count > 0 ? count : ""}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-3 border-b border-bungie-border/55 bg-black/15">
            {[[record.encounters, "Meetings", "text-white"], [record.wins, "Wins", "text-green-300"], [record.losses, "Losses", "text-red-300"]].map(([value, label, tone], index) => (
              <div key={String(label)} className={`px-3 py-2.5 ${index < 2 ? "border-r border-bungie-border/45" : ""}`}>
                <p className={`font-mono text-lg ${tone}`}>{value}</p>
                <p className="text-[9px] uppercase tracking-[0.17em] text-gray-500">{label}</p>
              </div>
            ))}
          </div>

          <div className="px-3 py-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-gray-500">Recent meetings</p>
              <p className="text-[9px] uppercase tracking-[0.16em] text-gray-600">Last {formatDate(summary.lastPlayedAt)}</p>
            </div>
            {meetings.length > 0 ? (
              <div className="divide-y divide-bungie-border/35 border-y border-bungie-border/45">
                {meetings.map((meeting) => (
                  <div key={meeting.instanceId} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 py-2">
                    <span className={`h-1.5 w-1.5 ${meeting.viewerWon === true ? "bg-green-400" : meeting.viewerWon === false ? "bg-red-400" : "bg-gray-500"}`} />
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-medium text-gray-200">{meeting.activityName ?? crucibleModeLabel(meeting.mode)}</p>
                      <p className="text-[9px] uppercase tracking-[0.14em] text-gray-600">{crucibleModeLabel(meeting.mode)}</p>
                    </div>
                    <span className={`font-mono text-[10px] font-bold ${meeting.viewerWon === true ? "text-green-300" : meeting.viewerWon === false ? "text-red-300" : "text-gray-500"}`}>
                      {meeting.viewerWon === true ? "W" : meeting.viewerWon === false ? "L" : "-"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="border border-dashed border-bungie-border/50 px-3 py-4 text-center text-xs text-gray-600">No recorded meetings in this playlist.</p>
            )}
            <p className="mt-3 text-[9px] uppercase tracking-[0.14em] text-gray-600">
              {importing ? "Importing older Crucible history" : "Based on recorded Bungie history"}
            </p>
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
        className="group flex items-center gap-1 border border-bungie-blue/30 bg-bungie-blue/10 px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none text-bungie-blue transition hover:border-bungie-blue/70 hover:bg-bungie-blue/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bungie-blue/70"
      >
        <Crosshair size={9} className="opacity-70 transition group-hover:rotate-45" />
        {summary.wins}-{summary.losses}
      </button>
      {popover}
    </div>
  );
}
