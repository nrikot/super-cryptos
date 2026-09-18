import type { Order, Trade } from "@/lib/ledger/types";

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsv(headers: string[], rows: string[][]): string {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(","));
  }
  return lines.join("\n");
}

function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function tsToIso(ts: number): string {
  return new Date(ts).toISOString();
}

export function exportFillsCsv(fills: Order[]): void {
  const headers = ["Time", "Pair", "Side", "Type", "Qty", "Fill Price", "Fee"];
  const rows = fills.map((o) => [
    tsToIso(o.createdAt),
    o.symbol,
    o.side,
    o.type,
    o.qty,
    o.avgFillPrice ?? "",
    o.fee ?? "",
  ]);
  downloadCsv(`cryptoz-fills-${Date.now()}.csv`, toCsv(headers, rows));
}

export function exportTradesCsv(
  trades: Trade[],
  journal?: Record<string, string>,
): void {
  const headers = [
    "Closed",
    "Pair",
    "Qty",
    "Avg Entry",
    "Avg Exit",
    "Gross PnL",
    "Fees",
    "Net PnL",
    "Journal",
  ];
  const rows = trades.map((t) => [
    tsToIso(t.closedAt),
    t.symbol,
    t.qty,
    t.avgEntry,
    t.avgExit,
    t.grossPnl,
    t.fees,
    t.netPnl,
    journal?.[t.id] ?? "",
  ]);
  downloadCsv(`cryptoz-trades-${Date.now()}.csv`, toCsv(headers, rows));
}
