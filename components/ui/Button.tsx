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
  primary: "bg-bungie-blue hover:opacity-90 text-white",
  success: "bg-green-700 hover:bg-green-600 text-white",
  danger: "bg-red-700 hover:bg-red-600 text-white",
  outline: "border border-bungie-border text-gray-300 hover:border-gray-400",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: Variant;
  fullWidth?: boolean;
  shape?: "pill" | "rounded";
}

export default function Button({
  children,
  variant = "primary",
  fullWidth = false,
  shape = "pill",
  className = "",
  disabled,
  ...rest
}: Props) {
  return (
    <button
      disabled={disabled}
      className={`${fullWidth ? "flex-1" : ""} px-4 py-2 ${shape === "pill" ? "rounded-full" : "rounded-lg"} text-sm font-semibold transition inline-flex items-center justify-center gap-2 disabled:opacity-40 ${VARIANT_CLS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
