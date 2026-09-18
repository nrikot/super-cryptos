import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface PriceAlert {
  id: string;
  symbol: string;
  targetPrice: string;
  direction: "above" | "below";
  triggered: boolean;
  createdAt: number;
}

type AlertsState = {
  alerts: PriceAlert[];
  hydrated: boolean;
  setHydrated: (v: boolean) => void;
  addAlert: (symbol: string, targetPrice: string, direction: "above" | "below") => void;
  removeAlert: (id: string) => void;
  markTriggered: (id: string) => void;
  clearAll: () => void;
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

export const useAlertsStore = create<AlertsState>()(
  persist(
    (set, get) => ({
      alerts: [],
      hydrated: false,
      setHydrated: (v) => set({ hydrated: v }),
      addAlert: (symbol, targetPrice, direction) => {
        const alert: PriceAlert = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          symbol: symbol.toUpperCase(),
          targetPrice,
          direction,
          triggered: false,
          createdAt: Date.now(),
        };
        set({ alerts: [...get().alerts, alert] });
      },
      removeAlert: (id) => {
        set({ alerts: get().alerts.filter((a) => a.id !== id) });
      },
      markTriggered: (id) => {
        set({
          alerts: get().alerts.map((a) =>
            a.id === id ? { ...a, triggered: true } : a,
          ),
        });
      },
      clearAll: () => set({ alerts: [] }),
    }),
    {
      name: "cryptoz-alerts",
      version: 1,
      storage,
      skipHydration: true,
      partialize: (s) => ({ alerts: s.alerts }),
    },
  ),
);
