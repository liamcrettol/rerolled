"use client";

import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

// Shared styled confirmation dialog (#187/#224) — replaces the native
// confirm() pattern for destructive or double-checked actions.

interface Props {
  title: string;
  body: string;
  confirmLabel: string;
  /** Visual weight of the confirm button. */
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
  /** Shown when a prior confirm attempt failed, so the user isn't left guessing. */
  error?: string | null;
  /** Disables both buttons and relabels confirm while the action is in flight. */
  confirming?: boolean;
}

export default function ConfirmDialog({
  title,
  body,
  confirmLabel,
  tone = "primary",
  onConfirm,
  onCancel,
  error,
  confirming,
}: Props) {
  return (
    <Modal>
      <div className="p-5">
        <p className="text-white text-base font-semibold mb-1.5">{title}</p>
        <p className="text-gray-400 text-sm leading-snug">{body}</p>
        {error && (
          <p className="mt-2 text-red-400 text-sm leading-snug">{error}</p>
        )}
      </div>
      <div className="flex gap-2 px-5 pb-5">
        <Button variant="outline" fullWidth onClick={onCancel} disabled={confirming}>
          Cancel
        </Button>
        <Button variant={tone === "danger" ? "danger" : "primary"} fullWidth onClick={onConfirm} disabled={confirming}>
          {confirming ? "Ending…" : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
