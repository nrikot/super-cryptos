import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  cancelOrder,
  createInitialState,
  executeLimitFill,
  executeMarketFill,
  getEquity,
  placeLimitOrder,
  recordSnapshot,
  resetAccount,
  updateOrderCursor,
} from "@/lib/ledger/ledger";
import { baseAsset } from "@/lib/ledger/math";
import type { LedgerState, OrderSide } from "@/lib/ledger/types";
import { SNAPSHOT_INTERVAL_MS } from "@/lib/ledger/math";

export const LEDGER_SCHEMA_VERSION = 2;

export interface PlaceArgs {
  symbol: string;
  side: OrderSide;
  qty: string;
  marketPrice: string;
  tickSize?: string;
  stepSize?: string;
}

export interface PlaceLimitArgs extends PlaceArgs {
  limitPrice: string;
  ocoStopPrice?: string;
  ocoTakeProfitPrice?: string;
}

type LedgerStore = {
  schemaVersion: number;
  hydrated: boolean;
  state: LedgerState;
  setHydrated: (v: boolean) => void;
  placeMarket: (args: PlaceArgs, markPrices?: Record<string, string>) => ReturnType<typeof executeMarketFill>;
  placeLimit: (args: PlaceLimitArgs) => ReturnType<typeof placeLimitOrder>;
  cancel: (orderId: string) => void;
  fillLimit: (
    orderId: string,
    marketPrice: string,
    opts?: { tickSize?: string; fillAtLimit?: boolean; markPrices?: Record<string, string> },
  ) => ReturnType<typeof executeLimitFill>;
  setCursor: (orderId: string, cursor: number) => void;
  snapshotNow: (prices: Record<string, string>) => void;
  maybeTimedSnapshot: (prices: Record<string, string>) => void;
  reset: (startingBalance?: string) => void;
  replaceState: (state: LedgerState) => void;
  setJournalNote: (tradeId: string, note: string) => void;
};

function migratePersisted(persisted: unknown): Pick<LedgerStore, "schemaVersion" | "state"> {
  const empty = {
    schemaVersion: LEDGER_SCHEMA_VERSION,
    state: createInitialState(),
  };
  if (!persisted || typeof persisted !== "object") return empty;
  const raw = persisted as {
    schemaVersion?: number;
    state?: LedgerState;
  };
  const incoming = raw.state;
  if (!incoming || !incoming.account) return empty;
  const account = incoming.account;
  const holdings: LedgerState["holdings"] = {};
  for (const [k, h] of Object.entries(incoming.holdings ?? {})) {
    holdings[k] = {
      asset: h.asset ?? k,
      qty: h.qty ?? "0",
      reservedQty: h.reservedQty ?? "0",
      avgEntry: h.avgEntry ?? "0",
      openedAt: h.openedAt ?? Date.now(),
    };
  }
  const state: LedgerState = {
    account: {
      cash: account.cash ?? "10000",
      reservedCash: account.reservedCash ?? "0",
      startingBalance: account.startingBalance ?? account.cash ?? "10000",
      quoteCurrency: account.quoteCurrency ?? "USDT",
    },
    holdings,
    orders: incoming.orders ?? [],
    trades: incoming.trades ?? [],
    snapshots:
      incoming.snapshots && incoming.snapshots.length > 0
        ? incoming.snapshots
        : [{ ts: Date.now(), equity: account.cash ?? "10000" }],
    lastSeen: incoming.lastSeen ?? Date.now(),
    journal: (incoming as unknown as { journal?: Record<string, string> }).journal ?? {},
  };
  return { schemaVersion: LEDGER_SCHEMA_VERSION, state };
}

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

export const useLedgerStore = create<LedgerStore>()(
  persist(
    (set, get) => ({
      schemaVersion: LEDGER_SCHEMA_VERSION,
      hydrated: false,
      state: createInitialState(),
      setHydrated: (v) => set({ hydrated: v }),
      placeMarket: (args, markPrices) => {
        const result = executeMarketFill(get().state, args);
        const prices = {
          ...markPrices,
          [baseAsset(args.symbol)]: result.order.avgFillPrice ?? args.marketPrice,
        };
        const snapped = recordSnapshot(
          result.state,
          getEquity(result.state, assetPricesFromState(result.state, prices)).toString(),
        );
        set({ state: snapped });
        return { ...result, state: snapped };
      },
      placeLimit: (args) => {
        const result = placeLimitOrder(get().state, {
          symbol: args.symbol,
          side: args.side,
          qty: args.qty,
          limitPrice: args.limitPrice,
          tickSize: args.tickSize,
          stepSize: args.stepSize,
          ocoStopPrice: args.ocoStopPrice,
          ocoTakeProfitPrice: args.ocoTakeProfitPrice,
        });
        set({ state: result.state });
        return result;
      },
      cancel: (orderId) => {
        set({ state: cancelOrder(get().state, orderId) });
      },
      fillLimit: (orderId, marketPrice, opts) => {
        const result = executeLimitFill(get().state, orderId, marketPrice, opts);
        if (!result) return null;
        const prices = {
          ...(opts?.markPrices ?? {}),
          [baseAsset(result.order.symbol)]: result.order.avgFillPrice ?? marketPrice,
        };
        const snapped = recordSnapshot(
          result.state,
          getEquity(result.state, assetPricesFromState(result.state, prices)).toString(),
        );
        set({ state: snapped });
        return { ...result, state: snapped };
      },
      setCursor: (orderId, cursor) => {
        set({ state: updateOrderCursor(get().state, orderId, cursor) });
      },
      snapshotNow: (prices) => {
        const { state } = get();
        const equity = getEquity(state, prices).toString();
        set({ state: recordSnapshot(state, equity) });
      },
      maybeTimedSnapshot: (prices) => {
        const { state } = get();
        const last = state.snapshots[state.snapshots.length - 1];
        if (last && Date.now() - last.ts < SNAPSHOT_INTERVAL_MS) return;
        get().snapshotNow(prices);
      },
      reset: (startingBalance) => {
        set({ state: resetAccount(get().state, startingBalance) });
      },
      replaceState: (state) => set({ state }),
      setJournalNote: (tradeId, note) => {
        const { state } = get();
        set({
          state: {
            ...state,
            journal: { ...state.journal, [tradeId]: note },
          },
        });
      },
    }),
    {
      name: "cryptoz-ledger",
      version: LEDGER_SCHEMA_VERSION,
      storage,
      skipHydration: true,
      partialize: (s) => ({ schemaVersion: s.schemaVersion, state: s.state }),
      migrate: (persisted) => migratePersisted(persisted) as never,
    },
  ),
);

function assetPricesFromState(
  state: LedgerState,
  extra: Record<string, string>,
): Record<string, string> {
  const prices = { ...extra };
  for (const h of Object.values(state.holdings)) {
    if (!prices[h.asset]) prices[h.asset] = h.avgEntry;
  }
  return prices;
}

export function tickersToAssetPrices(
  tickers: Record<string, { price: string; symbol: string }>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of Object.values(tickers)) {
    out[baseAsset(t.symbol)] = t.price;
  }
  return out;
}
