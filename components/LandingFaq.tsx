"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

// Signed-out landing FAQ. The one thing an established tool like DIM doesn't
// need on its homepage (years of Discord/Reddit reputation cover it) but a
// newer app does — answers the "why does this need my account / is it safe"
// objection right above the sign-in button instead of leaving it unaddressed.
const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Why does this need my Bungie account?",
    a: "Rolling pulls from your real inventory, and equipping a loadout goes through Bungie's API. Both need your account connected to work.",
  },
  {
    q: "Is my account safe?",
    a: "We don't delete, sell, or transfer anything. Your login token is encrypted and never leaves our server.",
  },
  {
    q: "What can't it do?",
    a: "It can't touch your Silver, delete anything, or go beyond reading your inventory and equipping whatever you or your captain rolls.",
  },
  {
    q: "Is it free?",
    a: "Yes, free to use.",
  },
];

export default function LandingFaq() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="w-full max-w-lg">
      <p className="section-label text-bungie-blue mb-3 text-center">FAQ</p>
      <div className="panel divide-y divide-bungie-border/60">
        {FAQ.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={item.q}>
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="text-sm text-gray-200 font-medium">{item.q}</span>
                <ChevronDown
                  size={14}
                  className={`shrink-0 text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
              </button>
              {isOpen && <p className="px-4 pb-3 text-xs text-gray-400 leading-relaxed">{item.a}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
