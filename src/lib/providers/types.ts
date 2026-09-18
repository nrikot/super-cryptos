import type { Candle, DataProviderName, Interval, SymbolInfo, Ticker } from "@/lib/market/types";

export interface MarketDataProvider {
  readonly name: DataProviderName;
  getTickerStreamUrl(): string;
  parseTickerMessage(data: unknown): Ticker | null;
  isHeartbeat(data: unknown): boolean;
  subscribePayload(canonicalSymbols: string[]): string;
  unsubscribePayload(canonicalSymbols: string[]): string | null;
  pingPayload(id: number): string | null;
  isPong(data: unknown, id: number): boolean;
}

export type RestMarketApi = {
  getTickers(symbols: string[]): Promise<Ticker[]>;
  getKlines(
    symbol: string,
    interval: Interval,
    limit?: number,
    startTimeMs?: number,
  ): Promise<Candle[]>;
  getExchangeInfo(): Promise<SymbolInfo[]>;
};
