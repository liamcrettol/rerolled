"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

export default function DraftLeaveButton({ lobbyId }: { lobbyId: string }) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  async function leaveDraft() {
    setLeaving(true);
    try {
      await fetch("/api/draft/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobbyId }),
      });
      router.push("/dashboard");
      router.refresh();
    } finally {
      setLeaving(false);
    }
  }

  return (
    <button
      type="button"
      onClick={leaveDraft}
      disabled={leaving}
      className="fixed right-6 top-6 z-50 inline-flex items-center gap-1.5 border border-bungie-border bg-bungie-surface px-3 py-2 text-xs font-bold uppercase tracking-wider text-gray-400 transition hover:border-red-500/60 hover:text-red-300 disabled:opacity-50"
    >
      <X size={14} />
      {leaving ? "Leaving" : "Leave Draft"}
    </button>
  );
}
