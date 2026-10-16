"use client";
import { useEffect, useState } from "react";
export default function ThemeToggle() {
  const [theme, setTheme] = useState("light");
  useEffect(() => {
    const system = matchMedia("(prefers-color-scheme: dark)");
    setTheme(document.documentElement.dataset.theme || (system.matches ? "dark" : "light"));
    const onChange = () => {
      let saved; try { saved = localStorage.getItem("mida-theme"); } catch {}
      if (saved !== "light" && saved !== "dark") {
        const next = system.matches ? "dark" : "light";
        document.documentElement.dataset.theme = next;
        setTheme(next);
      }
    };
    system.addEventListener("change", onChange);
    return () => system.removeEventListener("change", onChange);
  }, []);
  return <button type="button" className="mida-theme" aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`} onClick={() => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("mida-theme", next); } catch {}
    setTheme(next);
  }}>{theme === "dark" ? "Light" : "Dark"}</button>;
}
