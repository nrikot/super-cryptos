import { useEffect, useRef, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchExchangeInfo, fetchKlines, fetchTickers } from "@/lib/market/api";
import { detectKlineCrossing, tickCrossesLimit } from "@/lib/engine/crossing";
import { SNAPSHOT_INTERVAL_MS } from "@/lib/ledger/math";
import { useLedgerStore, tickersToAssetPrices } from "@/lib/stores/ledger-store";
import { useAlertsStore } from "@/lib/stores/alerts-store";
import { usePriceAlerts } from "@/hooks/use-price-alerts";
import { useDepthTape } from "@/hooks/use-depth-tape";
import { useMarketStore } from "@/lib/stores/market-store";
import { usePrefsStore } from "@/lib/stores/prefs-store";
import { getWsManager } from "@/lib/ws/manager";
import type { SymbolInfo } from "@/lib/market/types";

function subscribeNever() {
  return () => {};
}

export function useIsClient() {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}

export function useHydrateStores() {
  useEffect(() => {
    void Promise.resolve(useLedgerStore.persist.rehydrate()).finally(() => {
      useLedgerStore.getState().setHydrated(true);
    });
    void Promise.resolve(usePrefsStore.persist.rehydrate()).finally(() => {
      usePrefsStore.getState().setHydrated(true);
    });
    void Promise.resolve(useAlertsStore.persist.rehydrate()).finally(() => {
      useAlertsStore.getState().setHydrated(true);
    });
  }, []);
}

export function useTradingSession() {
  useHydrateStores();
  usePriceAlerts();
  useDepthTape();
  const isClient = useIsClient();
  const provider = usePrefsStore((s) => s.provider);
  const watchlist = usePrefsStore((s) => s.watchlist);
  const selected = usePrefsStore((s) => s.selectedSymbol);
  const interval = usePrefsStore((s) => s.interval);
  const wsStatus = useMarketStore((s) => s.wsStatus);

  const infoQuery = useQuery({
    queryKey: ["exchange-info", provider],
    queryFn: () => fetchExchangeInfo({ data: { provider } }),
    enabled: isClient,
    staleTime: 60 * 60 * 1000,
  });

  const tickersQuery = useQuery({
    queryKey: ["tickers", provider, watchlist.join(",")],
    queryFn: () => fetchTickers({ data: { provider, symbols: watchlist } }),
    enabled: isClient && watchlist.length > 0,
    refetchInterval: wsStatus === "connected" ? false : 4000,
    retry: 1,
  });

  const klinesQuery = useQuery({
    queryKey: ["klines", provider, selected, interval],
    queryFn: () =>
      fetchKlines({
        data: { provider, symbol: selected, interval, limit: 500 },
      }),
    enabled: isClient && Boolean(selected),
    staleTime: 20_000,
  });

  useEffect(() => {
    if (tickersQuery.data) {
      useMarketStore.getState().upsertMany(tickersQuery.data);
    }
  }, [tickersQuery.data]);

  useEffect(() => {
    if (tickersQuery.error) {
      useMarketStore
        .getState()
        .setError(
          tickersQuery.error instanceof Error
            ? tickersQuery.error.message
            : "Market data unavailable",
        );
    }
  }, [tickersQuery.error]);

  useEffect(() => {
    if (!isClient) return;
    const mgr = getWsManager(provider);
    mgr.setProvider(provider);
    mgr.setSymbols(watchlist);
    mgr.start();
    const offStatus = mgr.onStatus((s) => useMarketStore.getState().setWsStatus(s));
    const offTicker = mgr.onTicker((t) => {
      useMarketStore.getState().upsertTicker(t);
      evaluateLimitsForTicker(t.symbol, t.price, infoQuery.data);
    });
    return () => {
      offStatus();
      offTicker();
    };
  }, [isClient, provider, watchlist, infoQuery.data]);

  const backfilled = useRef(false);
  useEffect(() => {
    if (!isClient || backfilled.current) return;
    const open = useLedgerStore
      .getState()
      .state.orders.filter((o) => o.status === "open" && o.type === "limit");
    if (open.length === 0) {
      backfilled.current = true;
      return;
    }
    let cancelled = false;
    (async () => {
      for (const o of open) {
        try {
          const klines = await fetchKlines({
              data: {
                provider,
                symbol: o.symbol,
                interval: "1m",
                limit: 500,
                startTimeMs: o.createdAt,
              },
            });
          if (cancelled) return;
          const current = useLedgerStore
            .getState()
            .state.orders.find((x) => x.id === o.id);
          if (!current || current.status !== "open") continue;
          const hit = detectKlineCrossing(current, klines);
          if (hit.filled && current.limitPrice) {
            const info = infoQuery.data?.find((s) => s.symbol === current.symbol);
            const marks = tickersToAssetPrices(useMarketStore.getState().tickers);
            const res = useLedgerStore.getState().fillLimit(current.id, current.limitPrice, {
              fillAtLimit: true,
              tickSize: info?.tickSize,
              markPrices: marks,
            });
            if (res) {
              toast.success(
                `Limit ${current.side} ${current.symbol} filled at ${current.limitPrice}`,
              );
            }
          } else {
            useLedgerStore.getState().setCursor(current.id, hit.cursor);
          }
        } catch {
          /* best-effort backfill */
        }
      }
      backfilled.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [isClient, provider, infoQuery.data]);

  useEffect(() => {
    if (!isClient) return;
    const id = window.setInterval(() => {
      const prices = tickersToAssetPrices(useMarketStore.getState().tickers);
      useLedgerStore.getState().maybeTimedSnapshot(prices);
    }, SNAPSHOT_INTERVAL_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        const prices = tickersToAssetPrices(useMarketStore.getState().tickers);
        useLedgerStore.getState().snapshotNow(prices);
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [isClient]);

  return {
    infoQuery,
    tickersQuery,
    klinesQuery,
  };
}

function evaluateLimitsForTicker(
  symbol: string,
  price: string,
  infos: SymbolInfo[] | undefined,
) {
  const { state, fillLimit } = useLedgerStore.getState();
  const open = state.orders.filter(
    (o) => o.status === "open" && o.type === "limit" && o.symbol === symbol && o.limitPrice,
  );
  if (open.length === 0) return;
  const marks = tickersToAssetPrices(useMarketStore.getState().tickers);
  for (const o of open) {
    if (!tickCrossesLimit(o.side, o.limitPrice!, price)) continue;
    const info = infos?.find((s) => s.symbol === o.symbol);
    const res = fillLimit(o.id, price, {
      tickSize: info?.tickSize,
      markPrices: marks,
    });
    if (res) {
      toast.success(`Limit ${o.side} ${o.symbol} filled`);
    }
  }
}
