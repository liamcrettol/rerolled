import type { ReactNode } from "react";
import MidaWordmark from "./MidaWordmark";
import ThemeToggle from "./ThemeToggle";
export default function MidaHeader({ tool, href, children }: { tool: string; href?: string; children?: ReactNode }) {
  return <header className="mida-header"><MidaWordmark tool={tool} href={href} /><nav aria-label="Account and appearance" className="mida-header-actions">{children}<ThemeToggle /></nav></header>;
}
