import { formatPrice, formatQty } from "@/lib/format";
import { displayPair, quoteLabel } from "@/lib/market/symbols";
import { useDepthTapeStore } from "@/lib/stores/depth-tape-store";
import { usePrefsStore } from "@/lib/stores/prefs-store";
import { cn } from "@/lib/utils";

export function DepthTapePanel() {
  const symbol = usePrefsStore((s) => s.selectedSymbol);
  const provider = usePrefsStore((s) => s.provider);
  const quote = quoteLabel(provider);
  const depth = useDepthTapeStore((s) => s.depth);
  const trades = useDepthTapeStore((s) => s.trades);

  const maxQty = (() => {
    if (!depth) return 1;
    let max = 0;
    for (const l of depth.asks) max = Math.max(max, Number(l.qty));
    for (const l of depth.bids) max = Math.max(max, Number(l.qty));
    return max || 1;
  })();

  return (
    <div className="flex flex-col rounded-xl bg-card p-2 shadow-border sm:p-3 md:p-4">
      <h2 className="mb-2 text-sm font-medium">
        Depth &amp; Tape {displayPair(symbol, quote)}
      </h2>
      <div className="grid min-h-[240px] gap-2 sm:min-h-[280px] lg:grid-cols-2">
        <div className="space-y-0.5 font-mono text-xs tabular">
          <div className="flex justify-between px-1 pb-1 text-[10px] text-muted-foreground">
            <span>Price</span>
            <span>Qty</span>
          </div>
          {depth
            ? [...depth.asks].reverse().slice(0, 12).map((l, i) => {
                const pct = (Number(l.qty) / maxQty) * 100;
                return (
                  <div key={`a-${i}`} className="relative flex justify-between px-1">
                    <div
                      className="absolute inset-y-0 right-0 bg-sell/10"
                      style={{ width: `${pct}%` }}
                    />
                    <span className="relative text-sell">{formatPrice(l.price)}</span>
                    <span className="relative text-muted-foreground">{formatQty(l.qty)}</span>
                  </div>
                );
              })
            : Array.from({ length: 12 }).map((_, i) => (
                <div key={`a-${i}`} className="h-4 px-1">
                  <div className="h-full animate-pulse rounded bg-muted/30" />
                </div>
              ))}
          <div className="flex items-center justify-center py-1 text-xs text-muted-foreground">
            {depth ? (
              <span className="font-mono tabular">
                Spread {depth.asks.length && depth.bids.length
                  ? formatPrice(
                      String(
                        Number(depth.asks[0]?.price ?? 0) -
                          Number(depth.bids[0]?.price ?? 0),
                      ),
                    )
                  : "—"}
              </span>
            ) : (
              "Waiting for depth..."
            )}
          </div>
          {depth
            ? depth.bids.slice(0, 12).map((l, i) => {
                const pct = (Number(l.qty) / maxQty) * 100;
                return (
                  <div key={`b-${i}`} className="relative flex justify-between px-1">
                    <div
                      className="absolute inset-y-0 right-0 bg-buy/10"
                      style={{ width: `${pct}%` }}
                    />
                    <span className="relative text-buy">{formatPrice(l.price)}</span>
                    <span className="relative text-muted-foreground">{formatQty(l.qty)}</span>
                  </div>
                );
              })
            : Array.from({ length: 12 }).map((_, i) => (
                <div key={`b-${i}`} className="h-4 px-1">
                  <div className="h-full animate-pulse rounded bg-muted/30" />
                </div>
              ))}
        </div>

        <div className="space-y-0.5 overflow-hidden font-mono text-xs tabular">
          <div className="flex justify-between px-1 pb-1 text-[10px] text-muted-foreground">
            <span>Price</span>
            <span>Qty</span>
            <span>Time</span>
          </div>
          {trades.length === 0
            ? Array.from({ length: 12 }).map((_, i) => (
                <div key={`t-${i}`} className="h-4 px-1">
                  <div className="h-full animate-pulse rounded bg-muted/30" />
                </div>
              ))
            : trades.slice(0, 20).map((t) => (
                <div
                  key={t.id}
                  className={cn(
                    "flex justify-between px-1",
                    t.isBuyerMaker ? "text-sell" : "text-buy",
                  )}
                >
                  <span>{formatPrice(t.price)}</span>
                  <span className="text-muted-foreground">{formatQty(t.qty)}</span>
                  <span className="text-muted-foreground">
                    {new Date(t.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
        </div>
      </div>
    </div>
  );
}
