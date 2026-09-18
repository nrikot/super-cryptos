import { useMemo } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { computeAnalytics, change24h } from "@/lib/analytics/pnl";
import { getEquity } from "@/lib/ledger/ledger";
import { formatMoney, formatPct, formatSignedMoney } from "@/lib/format";
import { d } from "@/lib/ledger/math";
import { useLedgerStore, tickersToAssetPrices } from "@/lib/stores/ledger-store";
import { useMarketStore } from "@/lib/stores/market-store";
import { cn } from "@/lib/utils";

export function AnalyticsPanel() {
  const state = useLedgerStore((s) => s.state);
  const tickers = useMarketStore((s) => s.tickers);
  const prices = tickersToAssetPrices(tickers);
  const equity = getEquity(state, prices);
  const stats = computeAnalytics(state.trades, state.holdings, prices);
  const ch = change24h(state.snapshots, equity.toString());

  const chartData = useMemo(() => {
    const snaps = state.snapshots.map((s) => ({
      ts: s.ts,
      equity: Number(d(s.equity).toFixed(2)),
    }));
    snaps.push({ ts: Date.now(), equity: Number(equity.toFixed(2)) });
    return snaps;
  }, [state.snapshots, equity]);

  const items = [
    { label: "Realized", value: formatSignedMoney(stats.realized), tone: d(stats.realized) },
    { label: "Unrealized", value: formatSignedMoney(stats.unrealized), tone: d(stats.unrealized) },
    { label: "Win rate", value: `${stats.winRate}%`, tone: null },
    { label: "Profit factor", value: stats.profitFactor, tone: null },
    { label: "Avg win", value: formatSignedMoney(stats.avgWin), tone: d(stats.avgWin) },
    { label: "Avg loss", value: formatSignedMoney(stats.avgLoss), tone: d(stats.avgLoss) },
    { label: "Fees paid", value: formatMoney(stats.totalFees), tone: null },
    { label: "24h", value: `${formatSignedMoney(ch.amount)} (${formatPct(ch.pct)})`, tone: ch.amount },
  ];

  return (
    <section className="grid gap-2 sm:gap-3 lg:grid-cols-[1.4fr_1fr]">
      <div className="rounded-xl bg-card p-3 shadow-border sm:p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium">Equity curve</h2>
          <span className="font-mono text-xs text-muted-foreground tabular">
            on-trade + 5 min
          </span>
        </div>
        {chartData.length < 2 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Curve fills after the first snapshot.
          </p>
        ) : (
          <div className="h-40 sm:h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-buy)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--color-buy)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="ts"
                  tickFormatter={(v) =>
                    new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  }
                  tick={{ fill: "var(--color-subtle)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tickFormatter={(v) => `$${v}`}
                  tick={{ fill: "var(--color-subtle)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
                  formatter={(v) => [formatMoney(String(v ?? 0)), "Equity"]}
                />
                <Area
                  type="monotone"
                  dataKey="equity"
                  stroke="var(--color-buy)"
                  fill="url(#eq)"
                  strokeWidth={1.6}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className="rounded-xl bg-card p-3 shadow-border sm:p-4">
        <h2 className="mb-3 text-sm font-medium">P&L from closed lots</h2>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
          {items.map((it) => (
            <div key={it.label}>
              <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">
                {it.label}
              </dt>
              <dd
                className={cn(
                  "mt-0.5 font-mono text-sm tabular",
                  it.tone
                    ? it.tone.gt(0)
                      ? "text-buy"
                      : it.tone.lt(0)
                        ? "text-sell"
                        : "text-foreground"
                    : "text-foreground",
                )}
              >
                {it.value}
              </dd>
            </div>
          ))}
        </dl>
        {stats.bestTrade ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Best {formatSignedMoney(stats.bestTrade.netPnl)} · Worst{" "}
            {stats.worstTrade ? formatSignedMoney(stats.worstTrade.netPnl) : "—"}
          </p>
        ) : (
          <p className="mt-4 text-xs text-muted-foreground">
            Analytics use the trades table only — never raw order legs.
          </p>
        )}
      </div>
    </section>
  );
}
