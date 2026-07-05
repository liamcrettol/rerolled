"use client";

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
}

export default function ConfirmDialog({
  title,
  body,
  confirmLabel,
  tone = "primary",
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-bungie-surface border border-bungie-border rounded-xl shadow-2xl overflow-hidden">
        <div className="p-5">
          <p className="text-white text-base font-semibold mb-1.5">{title}</p>
          <p className="text-gray-400 text-sm leading-snug">{body}</p>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-full border border-bungie-border text-gray-300 hover:border-gray-400 transition text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2 rounded-full text-white transition text-sm font-semibold ${
              tone === "danger" ? "bg-red-700 hover:bg-red-600" : "bg-bungie-blue hover:opacity-90"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
