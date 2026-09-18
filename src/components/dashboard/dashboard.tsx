import { Header } from "@/components/dashboard/header";
import { TickerGrid } from "@/components/dashboard/ticker-grid";
import { CandleChart } from "@/components/dashboard/candle-chart";
import { TradePanel } from "@/components/dashboard/trade-panel";
import { WorkspaceTables } from "@/components/dashboard/tables";
import { AnalyticsPanel } from "@/components/dashboard/analytics-panel";
import { DepthTapePanel } from "@/components/dashboard/depth-tape-panel";
import { useTradingSession } from "@/hooks/use-trading-session";

export function Dashboard() {
  const { infoQuery, tickersQuery, klinesQuery } = useTradingSession();

  return (
    <div className="min-h-dvh pb-8">
      <Header />
      <main className="mx-auto flex max-w-[1400px] flex-col gap-2 px-3 pt-2 sm:gap-3 sm:px-4 sm:pt-3 md:gap-4 md:px-5 md:pt-4">
        <TickerGrid loading={tickersQuery.isLoading} />
        <div className="grid gap-2 sm:gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,0.9fr)]">
          <CandleChart
            candles={klinesQuery.data}
            loading={klinesQuery.isLoading}
            error={klinesQuery.isError}
          />
          <TradePanel infos={infoQuery.data} />
        </div>
        <DepthTapePanel />
        <WorkspaceTables infos={infoQuery.data} />
        <AnalyticsPanel />
        <footer className="px-1 pt-2 pb-4 text-center text-[11px] text-subtle">
          Simulated spot trading. Fills are priced off this feed with 0.05% slippage and a 0.1% fee.
          No shorting. Ledger math uses decimal.js. <br />
          Super Cryptos v.019 - developed by N Riko Trihendrawan <br />
          <a href="https://nrikot.github.io">https://nrikot.github.io</a>
        </footer>
      </main>
    </div>
  );
}
