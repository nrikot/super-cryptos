import { create } from "zustand";
import type { AggTrade, DepthSnapshot } from "@/lib/market/types";

const MAX_TRADES = 50;

type DepthTapeState = {
  depth: DepthSnapshot | null;
  trades: AggTrade[];
  upsertDepth: (d: DepthSnapshot) => void;
  pushTrade: (t: AggTrade) => void;
  clear: () => void;
};

export const useDepthTapeStore = create<DepthTapeState>()((set, get) => ({
  depth: null,
  trades: [],
  upsertDepth: (d) => set({ depth: d }),
  pushTrade: (t) => {
    const next = [t, ...get().trades];
    if (next.length > MAX_TRADES) next.length = MAX_TRADES;
    set({ trades: next });
  },
  clear: () => set({ depth: null, trades: [] }),
}));
