import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  DEFAULT_SYMBOL,
  DEFAULT_WATCHLIST,
  type DataProviderName,
  type Interval,
} from "@/lib/market/types";

export type Theme = "dark" | "light" | "system";

type PrefsState = {
  watchlist: string[];
  selectedSymbol: string;
  provider: DataProviderName;
  interval: Interval;
  theme: Theme;
  hydrated: boolean;
  setHydrated: (v: boolean) => void;
  selectSymbol: (symbol: string) => void;
  addToWatchlist: (symbol: string) => void;
  removeFromWatchlist: (symbol: string) => void;
  setProvider: (provider: DataProviderName) => void;
  setInterval: (interval: Interval) => void;
  setTheme: (theme: Theme) => void;
};

const storage = createJSONStorage(() => {
  if (typeof window === "undefined") {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
  }
  return localStorage;
});

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set, get) => ({
      watchlist: [...DEFAULT_WATCHLIST],
      selectedSymbol: DEFAULT_SYMBOL,
      provider: (import.meta.env.VITE_DATA_PROVIDER as DataProviderName) || "binance",
      interval: "1h",
      theme: "dark" as Theme,
      hydrated: false,
      setHydrated: (v) => set({ hydrated: v }),
      selectSymbol: (symbol) => {
        const s = symbol.toUpperCase();
        const watchlist = get().watchlist.includes(s)
          ? get().watchlist
          : [...get().watchlist, s];
        set({ selectedSymbol: s, watchlist });
      },
      addToWatchlist: (symbol) => {
        const s = symbol.toUpperCase();
        if (get().watchlist.includes(s)) {
          set({ selectedSymbol: s });
          return;
        }
        set({ watchlist: [...get().watchlist, s], selectedSymbol: s });
      },
      removeFromWatchlist: (symbol) => {
        const s = symbol.toUpperCase();
        const next = get().watchlist.filter((x) => x !== s);
        if (next.length === 0) return;
        const selected =
          get().selectedSymbol === s ? next[0] : get().selectedSymbol;
        set({ watchlist: next, selectedSymbol: selected });
      },
      setProvider: (provider) => set({ provider }),
      setInterval: (interval) => set({ interval }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "cryptoz-prefs",
      version: 2,
      storage,
      skipHydration: true,
      partialize: (s) => ({
        watchlist: s.watchlist,
        selectedSymbol: s.selectedSymbol,
        provider: s.provider,
        interval: s.interval,
        theme: s.theme,
      }),
    },
  ),
);
