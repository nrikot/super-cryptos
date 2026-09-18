import { d } from "@/lib/ledger/math";
import { toCanonical, toCoinbaseProduct } from "@/lib/market/symbols";
import type { Ticker } from "@/lib/market/types";
import type { MarketDataProvider } from "./types";

const WS_URL = "wss://ws-feed.exchange.coinbase.com";

export const coinbaseWs: MarketDataProvider = {
  name: "coinbase",

  getTickerStreamUrl() {
    return WS_URL;
  },

  parseTickerMessage(data: unknown): Ticker | null {
    const raw = data as {
      type?: string;
      product_id?: string;
      price?: string;
      open_24h?: string;
      high_24h?: string;
      low_24h?: string;
      volume_24h?: string;
      volume_30d?: string;
      time?: string;
    };
    if (!raw || raw.type !== "ticker" || !raw.product_id || !raw.price) {
      return null;
    }
    const price = d(raw.price);
    const open = raw.open_24h ? d(raw.open_24h) : price;
    const change = price.minus(open);
    const pct = open.isZero() ? d(0) : change.div(open).mul(100);
    const volume = d(raw.volume_24h ?? "0");
    return {
      symbol: toCanonical(raw.product_id),
      price: price.toString(),
      priceChange: change.toString(),
      priceChangePercent: pct.toFixed(4),
      high24h: raw.high_24h ?? raw.price,
      low24h: raw.low_24h ?? raw.price,
      volume: volume.toString(),
      quoteVolume: volume.mul(price).toString(),
      eventTime: raw.time ? Date.parse(raw.time) : Date.now(),
    };
  },

  isHeartbeat(data: unknown) {
    const raw = data as { type?: string };
    return raw?.type === "heartbeat" || raw?.type === "subscriptions";
  },

  subscribePayload(canonicalSymbols: string[]) {
    const product_ids = canonicalSymbols.map(toCoinbaseProduct);
    return JSON.stringify({
      type: "subscribe",
      product_ids,
      channels: ["ticker", { name: "heartbeat", product_ids }],
    });
  },

  unsubscribePayload(canonicalSymbols: string[]) {
    const product_ids = canonicalSymbols.map(toCoinbaseProduct);
    return JSON.stringify({
      type: "unsubscribe",
      product_ids,
      channels: ["ticker", "heartbeat"],
    });
  },

  pingPayload() {
    return null;
  },

  isPong(data: unknown) {
    const raw = data as { type?: string };
    return raw?.type === "heartbeat";
  },
};
