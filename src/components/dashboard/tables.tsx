import { useMemo, useState } from "react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exportFillsCsv, exportTradesCsv } from "@/lib/csv";
import { formatMoney, formatPct, formatPrice, formatQty, formatSignedMoney } from "@/lib/format";
import { d } from "@/lib/ledger/math";
import { getUnrealized } from "@/lib/ledger/ledger";
import type { Order, Trade } from "@/lib/ledger/types";
import { displayPair, quoteLabel } from "@/lib/market/symbols";
import { useLedgerStore, tickersToAssetPrices } from "@/lib/stores/ledger-store";
import { useMarketStore } from "@/lib/stores/market-store";
import { usePrefsStore } from "@/lib/stores/prefs-store";
import { cn } from "@/lib/utils";

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function WorkspaceTables({
  infos,
}: {
  infos: Array<{ symbol: string; tickSize?: string; stepSize?: string }> | undefined;
}) {
  return (
    <Tabs defaultValue="positions" className="rounded-xl bg-card p-2 shadow-border sm:p-3 md:p-4">
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="positions">Positions</TabsTrigger>
        <TabsTrigger value="orders">Open orders</TabsTrigger>
        <TabsTrigger value="history">Fills</TabsTrigger>
        <TabsTrigger value="trades">Closed lots</TabsTrigger>
      </TabsList>
      <TabsContent value="positions">
        <PositionsTable infos={infos} />
      </TabsContent>
      <TabsContent value="orders">
        <OrdersTable />
      </TabsContent>
      <TabsContent value="history">
        <FillsTable />
      </TabsContent>
      <TabsContent value="trades">
        <LotsTable />
      </TabsContent>
    </Tabs>
  );
}

function PositionsTable({
  infos,
}: {
  infos: Array<{ symbol: string; tickSize?: string; stepSize?: string }> | undefined;
}) {
  const holdings = useLedgerStore((s) => s.state.holdings);
  const tickers = useMarketStore((s) => s.tickers);
  const provider = usePrefsStore((s) => s.provider);
  const placeMarket = useLedgerStore((s) => s.placeMarket);
  const quote = quoteLabel(provider);
  const rows = Object.values(holdings);

  if (rows.length === 0) {
    return <Empty>No open positions. Buy a pair to start the ledger.</Empty>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th className="py-2 font-medium">Pair</th>
            <th className="py-2 font-medium">Qty</th>
            <th className="py-2 font-medium">Avg entry</th>
            <th className="py-2 font-medium">Mark</th>
            <th className="py-2 font-medium">uPnL</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => {
            const symbol = `${h.asset}USDT`;
            const t = tickers[symbol];
            const mark = t?.price ?? h.avgEntry;
            const u = getUnrealized(h, mark);
            const pct = d(h.avgEntry).isZero()
              ? d(0)
              : u.div(d(h.qty).mul(d(h.avgEntry))).mul(100);
            const up = u.gte(0);
            return (
              <tr key={h.asset} className="border-b border-border/60">
                <td className="py-3 font-medium">{displayPair(symbol, quote)}</td>
                <td className="py-3 font-mono tabular">{formatQty(h.qty)}</td>
                <td className="py-3 font-mono tabular">{formatPrice(h.avgEntry)}</td>
                <td className="py-3 font-mono tabular">{formatPrice(mark)}</td>
                <td className={cn("py-3 font-mono tabular", up ? "text-buy" : "text-sell")}>
                  {formatSignedMoney(u)} ({formatPct(pct)})
                </td>
                <td className="py-3 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (!t) {
                        toast.error("No mark price");
                        return;
                      }
                      try {
                        const info = infos?.find((s) => s.symbol === symbol);
                        placeMarket(
                          {
                            symbol,
                            side: "sell",
                            qty: h.qty,
                            marketPrice: t.price,
                            tickSize: info?.tickSize,
                            stepSize: info?.stepSize,
                          },
                          tickersToAssetPrices(useMarketStore.getState().tickers),
                        );
                        toast.success(`Closed ${h.asset}`);
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Close failed");
                      }
                    }}
                  >
                    Close
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OrdersTable() {
  const orders = useLedgerStore((s) => s.state.orders);
  const cancel = useLedgerStore((s) => s.cancel);
  const provider = usePrefsStore((s) => s.provider);
  const quote = quoteLabel(provider);
  const open = orders.filter((o) => o.status === "open");
  if (open.length === 0) {
    return <Empty>No resting limits. Place a limit order from the ticket.</Empty>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th className="py-2 font-medium">Pair</th>
            <th className="py-2 font-medium">Side</th>
            <th className="py-2 font-medium">Qty</th>
            <th className="py-2 font-medium">Limit</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {open.map((o) => (
            <tr key={o.id} className="border-b border-border/60">
              <td className="py-3">{displayPair(o.symbol, quote)}</td>
              <td className={o.side === "buy" ? "text-buy" : "text-sell"}>
                {o.side}
              </td>
              <td className="font-mono tabular">{formatQty(o.qty)}</td>
              <td className="font-mono tabular">
                {o.limitPrice ? formatPrice(o.limitPrice) : "—"}
              </td>
              <td className="text-right">
                <Button size="sm" variant="ghost" onClick={() => cancel(o.id)}>
                  Cancel
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FillsTable() {
  const orders = useLedgerStore((s) => s.state.orders);
  const provider = usePrefsStore((s) => s.provider);
  const quote = quoteLabel(provider);
  const filled = [...orders].filter((o) => o.status === "filled").reverse();
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const col = createColumnHelper<Order>();
  const columns = useMemo(
    () => [
      col.accessor("createdAt", {
        header: "Time",
        cell: (c) => new Date(c.getValue()).toLocaleString(),
      }),
      col.accessor("symbol", {
        header: "Pair",
        cell: (c) => displayPair(c.getValue(), quote),
      }),
      col.accessor("side", {
        header: "Side",
        cell: (c) => (
          <span className={c.getValue() === "buy" ? "text-buy" : "text-sell"}>
            {c.getValue()}
          </span>
        ),
      }),
      col.accessor("qty", {
        header: "Qty",
        cell: (c) => <span className="font-mono tabular">{formatQty(c.getValue())}</span>,
      }),
      col.accessor("avgFillPrice", {
        header: "Fill",
        cell: (c) => (
          <span className="font-mono tabular">
            {c.getValue() ? formatPrice(c.getValue()!) : "—"}
          </span>
        ),
      }),
      col.accessor("fee", {
        header: "Fee",
        cell: (c) => (
          <span className="font-mono tabular">
            {c.getValue() ? formatMoney(c.getValue()!) : "—"}
          </span>
        ),
      }),
    ],
    [quote],
  );
  const table = useReactTable({
    data: filled,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  if (filled.length === 0) {
    return <Empty>Fills appear here after a market or limit executes.</Empty>;
  }
  return (
    <div className="overflow-x-auto">
      <div className="mb-2 flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            exportFillsCsv(filled);
            toast.success("Fills CSV downloaded");
          }}
        >
          <Download className="mr-1.5 size-3.5" />
          Export CSV
        </Button>
      </div>
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-xs text-muted-foreground">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-border">
              {hg.headers.map((h) => (
                <th key={h.id} className="py-2 font-medium">
                  <button
                    type="button"
                    className="text-left"
                    onClick={h.column.getToggleSortingHandler()}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </button>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-b border-border/60">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="py-3">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LotsTable() {
  const trades = useLedgerStore((s) => s.state.trades);
  const journal = useLedgerStore((s) => s.state.journal);
  const setJournalNote = useLedgerStore((s) => s.setJournalNote);
  const provider = usePrefsStore((s) => s.provider);
  const quote = quoteLabel(provider);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (trades.length === 0) {
    return <Empty>Closed lots (the source of truth for win rate) show up after sells.</Empty>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="mb-2 flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            exportTradesCsv(trades, journal);
            toast.success("Closed lots CSV downloaded");
          }}
        >
          <Download className="mr-1.5 size-3.5" />
          Export CSV
        </Button>
      </div>
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th className="py-2 font-medium">Closed</th>
            <th className="py-2 font-medium">Pair</th>
            <th className="py-2 font-medium">Qty</th>
            <th className="py-2 font-medium">Entry → Exit</th>
            <th className="py-2 font-medium">Net</th>
            <th className="py-2 font-medium">Journal</th>
          </tr>
        </thead>
        <tbody>
          {[...trades].reverse().map((t: Trade) => {
            const up = d(t.netPnl).gte(0);
            const note = journal[t.id] ?? "";
            const isExpanded = expandedId === t.id;
            return (
              <>
                <tr key={t.id} className="border-b border-border/60">
                  <td className="py-3 text-xs text-muted-foreground">
                    {new Date(t.closedAt).toLocaleString()}
                  </td>
                  <td className="py-3">{displayPair(t.symbol, quote)}</td>
                  <td className="py-3 font-mono tabular">{formatQty(t.qty)}</td>
                  <td className="py-3 font-mono text-xs tabular">
                    {formatPrice(t.avgEntry)} → {formatPrice(t.avgExit)}
                  </td>
                  <td className={cn("py-3 font-mono tabular", up ? "text-buy" : "text-sell")}>
                    {formatSignedMoney(t.netPnl)}
                  </td>
                  <td className="py-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => setExpandedId(isExpanded ? null : t.id)}
                    >
                      {note ? "Edit note" : "Add note"}
                    </Button>
                  </td>
                </tr>
                {isExpanded && (
                  <tr key={`${t.id}-journal`}>
                    <td colSpan={6} className="border-b border-border/60 px-2 pb-3">
                      <textarea
                        className="w-full rounded-md border border-border bg-muted/30 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder="Trade notes — what did you learn? What was the setup?"
                        rows={3}
                        value={note}
                        onChange={(e) => setJournalNote(t.id, e.target.value)}
                      />
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}


