import { d } from "@/lib/ledger/math";
import { toBinanceSymbol, toCanonical } from "@/lib/market/symbols";
import type { Ticker } from "@/lib/market/types";
import type { MarketDataProvider } from "./types";

const WS_BASE = "wss://stream.binance.com:9443/stream";
// const WS_BASE = "wss://stream.binance.us:443/stream"; // US-only endpoint

function mapTicker(t: Record<string, string | number>): Ticker {
  return {
    symbol: toCanonical(String(t.s ?? t.symbol ?? "")),
    price: String(t.c ?? t.lastPrice ?? "0"),
    priceChange: String(t.p ?? t.priceChange ?? "0"),
    priceChangePercent: String(t.P ?? t.priceChangePercent ?? "0"),
    high24h: String(t.h ?? t.highPrice ?? "0"),
    low24h: String(t.l ?? t.lowPrice ?? "0"),
    volume: String(t.v ?? t.volume ?? "0"),
    quoteVolume: String(t.q ?? t.quoteVolume ?? "0"),
    eventTime: Number(t.E ?? t.closeTime ?? Date.now()),
  };
}

export const binanceWs: MarketDataProvider = {
  name: "binance",

  getTickerStreamUrl() {
    return WS_BASE;
  },

  parseTickerMessage(data: unknown): Ticker | null {
    const msg = data as { stream?: string; data?: Record<string, string | number> };
    const raw = (msg.data ?? data) as Record<string, string | number>;
    if (!raw || typeof raw !== "object") return null;
    if (!raw.s && !raw.symbol) return null;
    if (raw.e && raw.e !== "24hrTicker") return null;
    const t = mapTicker(raw);
    if (!t.symbol || d(t.price).lte(0)) return null;
    return t;
  },

  isHeartbeat() {
    return false;
  },

  subscribePayload(canonicalSymbols: string[]) {
    const params = canonicalSymbols.map(
      (s) => `${toBinanceSymbol(s).toLowerCase()}@ticker`,
    );
    return JSON.stringify({ method: "SUBSCRIBE", params, id: Date.now() });
  },

  unsubscribePayload(canonicalSymbols: string[]) {
    const params = canonicalSymbols.map(
      (s) => `${toBinanceSymbol(s).toLowerCase()}@ticker`,
    );
    return JSON.stringify({ method: "UNSUBSCRIBE", params, id: Date.now() });
  },

  pingPayload(id: number) {
    return JSON.stringify({ method: "LIST_SUBSCRIPTIONS", id });
  },

  isPong(data: unknown, id: number) {
    const msg = data as { id?: number; result?: unknown };
    return msg != null && msg.id === id && "result" in (msg as object);
  },
};
