import { create } from "zustand";
import type { Ticker, WsStatus } from "@/lib/market/types";

const SPARK_LEN = 42;

type MarketState = {
  tickers: Record<string, Ticker>;
  sparks: Record<string, number[]>;
  flashes: Record<string, "up" | "down">;
  wsStatus: WsStatus;
  lastError: string | null;
  upsertTicker: (t: Ticker) => void;
  upsertMany: (tickers: Ticker[]) => void;
  setWsStatus: (s: WsStatus) => void;
  setError: (msg: string | null) => void;
  clearFlash: (symbol: string) => void;
};

export const useMarketStore = create<MarketState>()((set, get) => ({
  tickers: {},
  sparks: {},
  flashes: {},
  wsStatus: "idle",
  lastError: null,
  upsertTicker: (t) => {
    const prev = get().tickers[t.symbol];
    const nextSparks = { ...get().sparks };
    const series = nextSparks[t.symbol] ? [...nextSparks[t.symbol]] : [];
    const px = Number(t.price);
    if (Number.isFinite(px)) {
      series.push(px);
      if (series.length > SPARK_LEN) series.splice(0, series.length - SPARK_LEN);
      nextSparks[t.symbol] = series;
    }
    let dir: "up" | "down" | undefined;
    if (prev) {
      const a = Number(prev.price);
      const b = Number(t.price);
      if (b > a) dir = "up";
      else if (b < a) dir = "down";
    }
    set({
      tickers: { ...get().tickers, [t.symbol]: t },
      sparks: nextSparks,
      flashes: dir
        ? { ...get().flashes, [t.symbol]: dir }
        : get().flashes,
      lastError: null,
    });
  },
  upsertMany: (tickers) => {
    const map = { ...get().tickers };
    const sparks = { ...get().sparks };
    for (const t of tickers) {
      map[t.symbol] = t;
      const px = Number(t.price);
      if (!Number.isFinite(px)) continue;
      const series = sparks[t.symbol] ? [...sparks[t.symbol]] : [];
      if (series.length === 0) series.push(px);
      sparks[t.symbol] = series;
    }
    set({ tickers: map, sparks, lastError: null });
  },
  setWsStatus: (wsStatus) => set({ wsStatus }),
  setError: (lastError) => set({ lastError }),
  clearFlash: (symbol) => {
    const { [symbol]: _omit, ...rest } = get().flashes;
    set({ flashes: rest });
  },
}));
