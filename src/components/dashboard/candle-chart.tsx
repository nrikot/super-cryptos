import { useEffect, useRef, useState } from "react";
import { INTERVALS, INTERVAL_SECONDS, type Candle, type Interval } from "@/lib/market/types";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { usePrefsStore } from "@/lib/stores/prefs-store";
import { useMarketStore } from "@/lib/stores/market-store";
import { displayPair, quoteLabel } from "@/lib/market/symbols";

type ChartApi = {
  remove: () => void;
  applyOptions: (opts: Record<string, unknown>) => void;
  timeScale: () => { fitContent: () => void };
  addSeries: (def: unknown, opts: unknown) => SeriesApi;
  subscribeCrosshairMove: (cb: (param: CrosshairParam) => void) => void;
};

type SeriesApi = {
  setData: (d: unknown[]) => void;
  update: (d: unknown) => void;
};

type CrosshairParam = {
  time?: number;
  seriesData?: Map<SeriesApi, { open?: number; high?: number; low?: number; close?: number; value?: number }>;
};

export function withLiveCandle(
  candles: Candle[],
  price: string | undefined,
  interval: Interval,
): Candle[] {
  if (!price || candles.length === 0) return candles;
  const px = Number(price);
  if (!Number.isFinite(px)) return candles;
  const size = INTERVAL_SECONDS[interval];
  const bucket = Math.floor(Date.now() / 1000 / size) * size;
  const last = candles[candles.length - 1];
  if (last.time === bucket) {
    return [
      ...candles.slice(0, -1),
      {
        ...last,
        close: px,
        high: Math.max(last.high, px),
        low: Math.min(last.low, px),
      },
    ];
  }
  if (bucket > last.time) {
    return [
      ...candles,
      { time: bucket, open: last.close, high: px, low: px, close: px, volume: 0 },
    ];
  }
  return candles;
}

export function CandleChart({
  candles,
  loading,
  error,
}: {
  candles: Candle[] | undefined;
  loading: boolean;
  error: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartApi | null>(null);
  const candleRef = useRef<SeriesApi | null>(null);
  const volRef = useRef<SeriesApi | null>(null);
  const [ohlc, setOhlc] = useState<string>("");
  const interval = usePrefsStore((s) => s.interval);
  const setInterval = usePrefsStore((s) => s.setInterval);
  const selected = usePrefsStore((s) => s.selectedSymbol);
  const provider = usePrefsStore((s) => s.provider);
  const ticker = useMarketStore((s) => s.tickers[selected]);
  const quote = quoteLabel(provider);

  const data = withLiveCandle(candles ?? [], ticker?.price, interval);

  useEffect(() => {
    if (!host.current) return;
    let disposed = false;
    let ro: ResizeObserver | null = null;
    (async () => {
      const mod = await import("lightweight-charts");
      if (disposed || !host.current) return;
      const styles = getComputedStyle(document.documentElement);
      const fg = styles.getPropertyValue("--color-muted-foreground").trim() || "#8b919c";
      const grid = styles.getPropertyValue("--color-chart-grid").trim() || "#1a1d24";
      const buy = styles.getPropertyValue("--color-buy").trim() || "#3ecf8e";
      const sell = styles.getPropertyValue("--color-sell").trim() || "#f07167";
      const chart = mod.createChart(host.current, {
        autoSize: true,
        layout: {
          background: { type: mod.ColorType.Solid, color: "transparent" },
          textColor: fg,
          fontFamily: "IBM Plex Mono, ui-monospace, monospace",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: grid },
          horzLines: { color: grid },
        },
        crosshair: { mode: mod.CrosshairMode.Normal },
        rightPriceScale: { borderColor: grid },
        timeScale: {
          borderColor: grid,
          timeVisible: true,
          secondsVisible: false,
        },
      }) as unknown as ChartApi;
      const candle = chart.addSeries(mod.CandlestickSeries, {
        upColor: buy,
        downColor: sell,
        borderUpColor: buy,
        borderDownColor: sell,
        wickUpColor: buy,
        wickDownColor: sell,
      });
      const vol = chart.addSeries(mod.HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "vol",
      });
      chart.applyOptions({
        rightPriceScale: { borderColor: grid },
      });
      (chart as unknown as { priceScale: (id: string) => { applyOptions: (o: object) => void } })
        .priceScale("vol")
        .applyOptions({
          scaleMargins: { top: 0.78, bottom: 0 },
          borderVisible: false,
        });
      chart.subscribeCrosshairMove((param) => {
        const c = param.seriesData?.get(candle);
        if (!c || c.open == null) {
          setOhlc("");
          return;
        }
        setOhlc(
          `O ${formatPrice(c.open)}  H ${formatPrice(c.high ?? c.open)}  L ${formatPrice(c.low ?? c.open)}  C ${formatPrice(c.close ?? c.open)}`,
        );
      });
      chartRef.current = chart;
      candleRef.current = candle;
      volRef.current = vol;
      ro = new ResizeObserver(() => chart.applyOptions({}));
      if (host.current) ro.observe(host.current);
    })();
    return () => {
      disposed = true;
      ro?.disconnect();
      chartRef.current?.remove();
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!candleRef.current || !volRef.current) return;
    const styles = getComputedStyle(document.documentElement);
    const buy = styles.getPropertyValue("--color-buy").trim() || "#3ecf8e";
    const sell = styles.getPropertyValue("--color-sell").trim() || "#f07167";
    candleRef.current.setData(
      data.map((c) => ({
        time: c.time as never,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
    volRef.current.setData(
      data.map((c) => ({
        time: c.time as never,
        value: c.volume,
        color: c.close >= c.open ? buy : sell,
      })),
    );
    chartRef.current?.timeScale().fitContent();
  }, [data, selected, interval]);

  return (
    <section className="flex min-h-[220px] flex-col rounded-xl bg-card p-2 shadow-border sm:p-3 md:min-h-[320px] md:p-4 lg:min-h-[380px]">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-semibold tracking-wide">
            {displayPair(selected, quote)}
          </span>
          <span className="min-h-5 font-mono text-[11px] text-muted-foreground tabular">
            {ohlc || "Hover for OHLCV"}
          </span>
        </div>
        <div className="flex rounded-md bg-secondary p-0.5">
          {INTERVALS.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setInterval(tf)}
              className={cn(
                "h-8 min-w-9 rounded-sm px-2 text-xs font-medium",
                interval === tf
                  ? "bg-card text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        {loading && (!candles || candles.length === 0) ? (
          <Skeleton className="absolute inset-0 rounded-lg" />
        ) : null}
        {error && (!candles || candles.length === 0) ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Chart data unavailable
          </div>
        ) : null}
        <div ref={host} className="absolute inset-0" />
      </div>
    </section>
  );
}
