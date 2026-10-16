import type { ButtonHTMLAttributes, ReactNode } from "react";

// Shared button (#227) — covers the recurring solid/outline variants seen
// across LobbyRoom's action row and ConfirmDialog (bg-bungie-blue primary,
// green apply/confirm, red danger, and the bordered outline/cancel pair).
// Deliberately doesn't try to cover every one-off button in the app (some
// have bespoke padding/width for their specific layout) — see #227's own
// scope note: this proves the primitive out on the clearest repeats rather
// than forcing every button through one shape.
type Variant = "primary" | "success" | "danger" | "outline";

const VARIANT_CLS: Record<Variant, string> = {
  primary: "bg-bungie-blue hover:bg-white text-bungie-dark",
  success: "bg-bungie-blue text-bungie-dark",
  danger: "bg-bungie-blue text-bungie-dark",
  outline: "border border-bungie-border text-gray-300 hover:border-gray-400",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: Variant;
  fullWidth?: boolean;
}

export default function Button({
  children,
  variant = "primary",
  fullWidth = false,
  className = "",
  disabled,
  ...rest
}: Props) {
  return (
    <button
      disabled={disabled}
      className={`${fullWidth ? "flex-1" : ""} min-h-11 px-4 py-2 text-sm font-bold   transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-40 ${VARIANT_CLS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
