import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPct, formatPrice, compactUsd } from "@/lib/format";
import { displayPair, quoteLabel } from "@/lib/market/symbols";
import { useMarketStore } from "@/lib/stores/market-store";
import { usePrefsStore } from "@/lib/stores/prefs-store";
import { Skeleton } from "@/components/ui/skeleton";

function Spark({ values, up }: { values: number[]; up: boolean }) {
  if (values.length < 2) {
    return <div className="h-8 w-20" />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 80;
  const h = 32;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} aria-hidden="true" className="shrink-0">
      <polyline
        fill="none"
        points={pts}
        strokeWidth="1.6"
        className={up ? "spark-up" : "spark-down"}
      />
    </svg>
  );
}

export function TickerGrid({ loading }: { loading: boolean }) {
  const watchlist = usePrefsStore((s) => s.watchlist);
  const selected = usePrefsStore((s) => s.selectedSymbol);
  const select = usePrefsStore((s) => s.selectSymbol);
  const remove = usePrefsStore((s) => s.removeFromWatchlist);
  const provider = usePrefsStore((s) => s.provider);
  const tickers = useMarketStore((s) => s.tickers);
  const sparks = useMarketStore((s) => s.sparks);
  const flashes = useMarketStore((s) => s.flashes);
  const clearFlash = useMarketStore((s) => s.clearFlash);
  const quote = quoteLabel(provider);

  if (loading && watchlist.every((s) => !tickers[s])) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {watchlist.slice(0, 6).map((s) => (
          <Skeleton key={s} className="h-24 rounded-xl sm:h-28" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {watchlist.map((symbol) => {
        const t = tickers[symbol];
        const pct = t ? Number(t.priceChangePercent) : 0;
        const up = pct >= 0;
        const flash = flashes[symbol];
        return (
          <TickerTile
            key={symbol}
            symbol={symbol}
            label={displayPair(symbol, quote)}
            price={t ? formatPrice(t.price) : "—"}
            change={t ? formatPct(t.priceChangePercent) : "—"}
            high={t ? formatPrice(t.high24h) : "—"}
            low={t ? formatPrice(t.low24h) : "—"}
            volume={t ? compactUsd(t.quoteVolume) : "—"}
            up={up}
            selected={selected === symbol}
            flash={flash}
            spark={sparks[symbol] ?? []}
            onSelect={() => select(symbol)}
            onFlashEnd={() => clearFlash(symbol)}
            onRemove={() => remove(symbol)}
            canRemove={watchlist.length > 1}
          />
        );
      })}
    </div>
  );
}

function TickerTile(props: {
  symbol: string;
  label: string;
  price: string;
  change: string;
  high: string;
  low: string;
  volume: string;
  up: boolean;
  selected: boolean;
  flash?: "up" | "down";
  spark: number[];
  onSelect: () => void;
  onFlashEnd: () => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  useEffect(() => {
    if (!props.flash) return;
    const id = window.setTimeout(props.onFlashEnd, 450);
    return () => window.clearTimeout(id);
  }, [props.flash, props.onFlashEnd]);

  return (
    <div
      className={cn(
        "group relative rounded-xl bg-card p-3 shadow-border transition-[box-shadow,background-color] duration-150",
        "hover:shadow-border-hover",
        props.selected && "ring-1 ring-primary/25 bg-primary/15",
        props.flash === "up" && "flash-up",
        props.flash === "down" && "flash-down",
      )}
    >
      <button
        type="button"
        onClick={props.onSelect}
        className="flex w-full flex-col gap-2 text-left"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs font-medium tracking-wide text-muted-foreground">
              {props.label}
            </div>
            <div className="mt-1 font-mono text-base font-medium tabular">
              {props.price}
            </div>
          </div>
          <Spark values={props.spark} up={props.up} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "font-mono text-xs tabular",
              props.up ? "text-buy" : "text-sell",
            )}
          >
            {props.change}
          </span>
          <span className="text-[10px] text-subtle tabular">
            Vol {props.volume}
          </span>
        </div>
        <div className="flex justify-between text-[10px] text-subtle tabular">
          <span>H {props.high}</span>
          <span>L {props.low}</span>
        </div>
      </button>
      {props.canRemove ? (
        <button
          type="button"
          aria-label={`Remove ${props.label}`}
          className="absolute top-1.5 right-1.5 hidden size-7 items-center justify-center rounded-sm text-subtle hover:text-foreground group-hover:flex"
          onClick={(e) => {
            e.stopPropagation();
            props.onRemove();
          }}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
