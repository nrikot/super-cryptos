export type Interval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
export type DataProviderName = "binance" | "coinbase";
export type WsStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export interface Ticker {
  symbol: string;
  price: string;
  priceChange: string;
  priceChangePercent: string;
  high24h: string;
  low24h: string;
  volume: string;
  quoteVolume: string;
  eventTime: number;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SymbolInfo {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: string;
  tickSize: string;
  stepSize: string;
  minQty: string;
}

export const INTERVALS: Interval[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

export const INTERVAL_SECONDS: Record<Interval, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
};

export const DEFAULT_WATCHLIST = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "POLUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "DOTUSDT",
  "LTCUSDT",
  "ATOMUSDT",
] as const;

export const DEFAULT_SYMBOL = "BTCUSDT";

export interface DepthLevel {
  price: string;
  qty: string;
}

export interface DepthSnapshot {
  symbol: string;
  bids: DepthLevel[];
  asks: DepthLevel[];
  lastUpdate: number;
}

export interface AggTrade {
  id: string;
  symbol: string;
  price: string;
  qty: string;
  isBuyerMaker: boolean;
  timestamp: number;
}
