"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type ThemePreference = "light" | "dark" | "system";
const KEY = "gita.theme";

function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemePreference>("system");
  useEffect(() => { setMode(readPreference()); }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      document.documentElement.dataset.theme =
        mode === "system" ? (media.matches ? "dark" : "light") : mode;
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [mode]);

  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
  function toggle() {
    const next: ThemePreference = mode === "system" ? "light" : mode === "light" ? "dark" : "system";
    try {
      if (next === "system") window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, next);
    } catch {
      // A storage-disabled browser can still change the theme for this session.
    }
    setMode(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={`Theme: ${mode}. Click to switch.`}
      aria-label={`Theme: ${mode}. Switch theme.`}
      className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-panel px-3 text-sm text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span className="hidden sm:inline capitalize">{mode}</span>
    </button>
  );
}
