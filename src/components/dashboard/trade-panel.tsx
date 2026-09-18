import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  availableCash,
  availableQty,
  calcFee,
  d,
  DEFAULT_SLIPPAGE,
  FEE_RATE,
  roundToStep,
  trimZeros,
} from "@/lib/ledger/math";
import { formatMoney, formatPrice, formatQty } from "@/lib/format";
import { baseAsset, displayPair, quoteLabel } from "@/lib/market/symbols";
import {
  InsufficientCashError,
  InsufficientHoldingsError,
} from "@/lib/ledger/types";
import { useLedgerStore, tickersToAssetPrices } from "@/lib/stores/ledger-store";
import { useMarketStore } from "@/lib/stores/market-store";
import { usePrefsStore } from "@/lib/stores/prefs-store";
import { cn } from "@/lib/utils";
import type { OrderSide } from "@/lib/ledger/types";
import type { SymbolInfo } from "@/lib/market/types";

export function TradePanel({ infos }: { infos: SymbolInfo[] | undefined }) {
  const symbol = usePrefsStore((s) => s.selectedSymbol);
  const provider = usePrefsStore((s) => s.provider);
  const ticker = useMarketStore((s) => s.tickers[symbol]);
  const state = useLedgerStore((s) => s.state);
  const placeMarket = useLedgerStore((s) => s.placeMarket);
  const placeLimit = useLedgerStore((s) => s.placeLimit);
  const [side, setSide] = useState<OrderSide>("buy");
  const [type, setType] = useState<"market" | "limit">("market");
  const [qty, setQty] = useState("");
  const [limit, setLimit] = useState("");
  const [ocoEnabled, setOcoEnabled] = useState(false);
  const [ocoStop, setOcoStop] = useState("");
  const [ocoTp, setOcoTp] = useState("");
  const [error, setError] = useState<string | null>(null);

  const info = infos?.find((s) => s.symbol === symbol);
  const asset = baseAsset(symbol);
  const holding = state.holdings[asset];
  const quote = quoteLabel(provider);
  const price = ticker ? d(ticker.price) : null;
  const step = info?.stepSize ?? "0.00000001";
  const cash = availableCash(state.account.cash, state.account.reservedCash);
  const held = holding
    ? availableQty(holding.qty, holding.reservedQty)
    : d(0);

  const px = useMemo(() => {
    if (type === "limit" && limit) return d(limit);
    return price;
  }, [type, limit, price]);

  const qtyDec = qty ? d(qty) : d(0);
  const notional = px && qtyDec.gt(0) ? qtyDec.mul(px) : d(0);
  const fee = calcFee(notional);
  const slipNote =
    type === "market" ? DEFAULT_SLIPPAGE.mul(100).toFixed(2) : null;

  function applyPct(pct: number) {
    if (side === "buy") {
      if (!px || px.lte(0)) return;
      const slip = type === "market" ? DEFAULT_SLIPPAGE : d(0);
      const fill = px.mul(d(1).plus(slip));
      const budget = cash.mul(d(pct).div(100));
      const q = roundToStep(budget.div(fill.mul(d(1).plus(FEE_RATE))), step);
      setQty(q.lte(0) ? "" : trimZeros(q));
    } else {
      const q = roundToStep(held.mul(d(pct).div(100)), step);
      setQty(q.lte(0) ? "" : trimZeros(q));
    }
  }

  function submit() {
    setError(null);
    if (!ticker) {
      setError("No live price for this pair yet.");
      return;
    }
    if (!qtyDec.gt(0)) {
      setError("Enter a quantity.");
      return;
    }
    const marks = tickersToAssetPrices(useMarketStore.getState().tickers);
    try {
      if (type === "market") {
        placeMarket(
          {
            symbol,
            side,
            qty: qtyDec.toString(),
            marketPrice: ticker.price,
            tickSize: info?.tickSize,
            stepSize: info?.stepSize,
          },
          marks,
        );
        toast.success(`${side === "buy" ? "Bought" : "Sold"} ${formatQty(qtyDec)} ${asset}`);
      } else {
        if (!limit || d(limit).lte(0)) {
          setError("Enter a limit price.");
          return;
        }
        placeLimit({
          symbol,
          side,
          qty: qtyDec.toString(),
          marketPrice: ticker.price,
          limitPrice: limit,
          tickSize: info?.tickSize,
          stepSize: info?.stepSize,
          ocoStopPrice: ocoEnabled && ocoStop ? ocoStop : undefined,
          ocoTakeProfitPrice: ocoEnabled && ocoTp ? ocoTp : undefined,
        });
        toast.success(`Limit ${side} resting`);
      }
      setQty("");
      setOcoStop("");
      setOcoTp("");
    } catch (err) {
      if (err instanceof InsufficientHoldingsError || err instanceof InsufficientCashError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Order rejected");
      }
    }
  }

  return (
    <section className="flex flex-col rounded-xl bg-card p-3 shadow-border sm:p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium">Trade {displayPair(symbol, quote)}</h2>
        <span className="font-mono text-xs text-muted-foreground tabular">
          {ticker ? formatPrice(ticker.price) : "—"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
        <button
          type="button"
          className={cn(
            "h-10 rounded-md text-sm font-medium",
            side === "buy" ? "bg-buy text-buy-foreground" : "text-muted-foreground",
          )}
          onClick={() => setSide("buy")}
        >
          Buy
        </button>
        <button
          type="button"
          className={cn(
            "h-10 rounded-md text-sm font-medium",
            side === "sell" ? "bg-sell text-sell-foreground" : "text-muted-foreground",
          )}
          onClick={() => setSide("sell")}
        >
          Sell
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1">
        {(["market", "limit"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={cn(
              "h-9 rounded-md text-xs font-medium capitalize",
              type === t ? "bg-card text-foreground" : "text-muted-foreground",
            )}
            onClick={() => setType(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {type === "limit" ? (
        <div className="mt-3 space-y-1.5">
          <Label htmlFor="limit-px">Limit price</Label>
          <Input
            id="limit-px"
            inputMode="decimal"
            placeholder={ticker ? formatPrice(ticker.price) : "0.00"}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
          <button
            type="button"
            className="mt-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setOcoEnabled(!ocoEnabled)}
          >
            {ocoEnabled ? "- Hide" : "+ Stop-loss / Take-profit"}
          </button>
          {ocoEnabled && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="oco-stop" className="text-[11px]">
                  Stop-loss
                </Label>
                <Input
                  id="oco-stop"
                  inputMode="decimal"
                  placeholder="Stop"
                  value={ocoStop}
                  onChange={(e) => setOcoStop(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="oco-tp" className="text-[11px]">
                  Take-profit
                </Label>
                <Input
                  id="oco-tp"
                  inputMode="decimal"
                  placeholder="Target"
                  value={ocoTp}
                  onChange={(e) => setOcoTp(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      ) : null}
      <div className="mt-3 space-y-1.5">
        <Label htmlFor="qty">Quantity ({asset})</Label>
        <Input
          id="qty"
          inputMode="decimal"
          placeholder="0.00"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1">
        {[25, 50, 100].map((p) => (
          <Button
            key={p}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => applyPct(p)}
          >
            {p}%
          </Button>
        ))}
      </div>
      <dl className="mt-4 space-y-1.5 text-xs">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Est. notional</dt>
          <dd className="font-mono tabular">{formatMoney(notional)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Fee (0.10%)</dt>
          <dd className="font-mono tabular">{formatMoney(fee)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">
            {side === "buy" ? "Total debit" : "Net credit"}
          </dt>
          <dd className="font-mono tabular">
            {formatMoney(side === "buy" ? notional.plus(fee) : notional.minus(fee))}
          </dd>
        </div>
        {slipNote ? (
          <div className="flex justify-between text-subtle">
            <dt>Slippage</dt>
            <dd>{slipNote}%</dd>
          </div>
        ) : null}
        <div className="flex justify-between text-subtle">
          <dt>{side === "buy" ? "Buying power" : `Available ${asset}`}</dt>
          <dd className="font-mono tabular">
            {side === "buy" ? formatMoney(cash) : formatQty(held)}
          </dd>
        </div>
      </dl>
      {error ? (
        <p className="mt-3 rounded-md bg-sell/10 px-3 py-2 text-xs text-sell">
          {error}
        </p>
      ) : null}
      <Button
        className="mt-4 w-full"
        variant={side === "buy" ? "buy" : "sell"}
        onClick={submit}
      >
        {type === "market" ? "Market" : "Limit"} {side === "buy" ? "buy" : "sell"}{" "}
        {asset}
      </Button>
    </section>
  );
}
