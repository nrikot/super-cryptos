import { useEffect } from "react";
import { usePrefsStore, type Theme } from "@/lib/stores/prefs-store";

function resolveTheme(theme: Theme): "dark" | "light" {
  if (theme !== "system") return theme;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function useTheme() {
  const theme = usePrefsStore((s) => s.theme);
  const setTheme = usePrefsStore((s) => s.setTheme);

  useEffect(() => {
    const root = document.documentElement;
    const resolved = resolveTheme(theme);

    root.classList.remove("dark", "light");
    root.classList.add(resolved);

    if (theme !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handler = () => {
      const next = mq.matches ? "light" : "dark";
      root.classList.remove("dark", "light");
      root.classList.add(next);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return { theme, setTheme } as const;
}
