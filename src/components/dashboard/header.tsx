import { useState } from "react";
import { Activity, RotateCcw, Sun, Moon, Monitor } from "lucide-react";
import { Logo } from "@/components/logo";
import { PairSearch } from "@/components/dashboard/pair-search";
import { PriceAlertButton } from "@/components/dashboard/price-alerts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buyingPower, getEquity } from "@/lib/ledger/ledger";
import { formatMoney, formatPct, formatSignedMoney } from "@/lib/format";
import { change24h } from "@/lib/analytics/pnl";
import { useLedgerStore, tickersToAssetPrices } from "@/lib/stores/ledger-store";
import { useMarketStore } from "@/lib/stores/market-store";
import { usePrefsStore, type Theme } from "@/lib/stores/prefs-store";
import { cn } from "@/lib/utils";

export function Header() {
  const state = useLedgerStore((s) => s.state);
  const reset = useLedgerStore((s) => s.reset);
  const tickers = useMarketStore((s) => s.tickers);
  const ws = useMarketStore((s) => s.wsStatus);
  const err = useMarketStore((s) => s.lastError);
  const provider = usePrefsStore((s) => s.provider);
  const setProvider = usePrefsStore((s) => s.setProvider);
  const theme = usePrefsStore((s) => s.theme);
  const setTheme = usePrefsStore((s) => s.setTheme);
  const prices = tickersToAssetPrices(tickers);
  const equity = getEquity(state, prices);
  const cash = buyingPower(state.account);
  const ch = change24h(state.snapshots, equity.toString());
  const live = ws === "connected";
  const [balance, setBalance] = useState(state.account.startingBalance);
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:py-3 md:px-5">
        <div className="flex items-center justify-between gap-2">
          <Logo />
          <div className="flex items-center gap-2 sm:hidden">
            <WsChip live={live} ws={ws} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs sm:flex sm:flex-wrap sm:items-center sm:gap-4">
          <Stat label="Equity" value={formatMoney(equity)} />
          <Stat label="Cash" value={formatMoney(cash)} />
          <Stat
            label="24h"
            value={`${formatSignedMoney(ch.amount)} ${formatPct(ch.pct)}`}
            tone={ch.amount.gt(0) ? "up" : ch.amount.lt(0) ? "down" : undefined}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <div className="hidden sm:block">
            <WsChip live={live} ws={ws} />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                {provider === "coinbase" ? "Coinbase" : "Binance"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setProvider("coinbase")}>
                Coinbase
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setProvider("binance")}>
                Binance
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Toggle theme">
                {theme === "dark" ? (
                  <Moon className="size-4" />
                ) : theme === "light" ? (
                  <Sun className="size-4" />
                ) : (
                  <Monitor className="size-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setTheme("dark")}>
                <Moon className="mr-2 size-4" /> Dark
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("light")}>
                <Sun className="mr-2 size-4" /> Light
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("system")}>
                <Monitor className="mr-2 size-4" /> System
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <PairSearch />
          <PriceAlertButton />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Reset account">
                <RotateCcw className="size-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reset paper account</DialogTitle>
                <DialogDescription>
                  Clears positions, orders, trades, and the equity curve. Starting
                  cash is configurable.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="start-bal">Starting balance (USDT)</Label>
                <Input
                  id="start-bal"
                  inputMode="decimal"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                />
              </div>
              <Button
                variant="destructive"
                onClick={() => {
                  reset(balance || "10000");
                  setOpen(false);
                }}
              >
                Reset account
              </Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      {!live || err ? (
        <div className="border-t border-border bg-secondary px-3 py-2 text-center text-xs text-muted-foreground md:px-5">
          {live
            ? err
            : "Feed reconnecting — prices poll over REST until the socket is back."}
        </div>
      ) : null}
    </header>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div>
      <div className="text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className={cn(
          "font-mono text-sm tabular",
          tone === "up" && "text-buy",
          tone === "down" && "text-sell",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function WsChip({ live, ws }: { live: boolean; ws: string }) {
  return (
    <Badge variant={live ? "live" : "stale"} className="gap-1.5">
      <Activity className={cn("size-3", live && "ws-live")} />
      {live ? "Live" : ws === "reconnecting" ? "Reconnecting" : "Polling"}
    </Badge>
  );
}
