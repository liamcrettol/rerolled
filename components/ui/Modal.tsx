import type { ReactNode } from "react";

// Shared modal backdrop+card (#227) — generalizes the styled dialog pattern
// that replaced the native confirm() for the double-special warning (#187),
// now also used for the End Session confirmation. `onBackdropClick` is
// optional since the two existing dialogs are both intentionally
// non-dismissible by backdrop click (they require an explicit choice).
interface Props {
  children: ReactNode;
  onBackdropClick?: () => void;
}

export default function Modal({ children, onBackdropClick }: Props) {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onBackdropClick}
    >
      <div
        className="w-full max-w-sm bg-bungie-surface border border-bungie-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
