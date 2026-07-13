"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import ConfirmDialog from "@/components/lobby/ConfirmDialog";

export default function DraftLeaveButton({ lobbyId }: { lobbyId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leaveDraft() {
    setLeaving(true);
    setError(null);
    try {
      const res = await fetch("/api/draft/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobbyId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to leave draft");
      }
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to leave draft");
      setLeaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="fixed right-6 top-6 z-50 inline-flex items-center gap-1.5 border border-bungie-border bg-bungie-surface px-3 py-2 text-xs font-bold uppercase tracking-wider text-gray-400 transition hover:border-red-500/60 hover:text-red-300"
      >
        <X size={14} />
        Leave Draft
      </button>

      {confirming && (
        <ConfirmDialog
          title="Leave this draft?"
          body="Leaving Draft ends this draft for everyone in the fireteam."
          confirmLabel="Leave Draft"
          tone="danger"
          onCancel={() => { setConfirming(false); setError(null); }}
          onConfirm={leaveDraft}
          error={error}
          confirming={leaving}
        />
      )}
    </>
  );
}
