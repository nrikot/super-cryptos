import { toBinanceSymbol, toCanonical, toCoinbaseProduct, baseAsset } from "@/lib/market/symbols";
import type { Candle, DataProviderName, Interval, SymbolInfo, Ticker } from "@/lib/market/types";
import { INTERVAL_SECONDS } from "@/lib/market/types";
import { d } from "@/lib/ledger/math";

const BINANCE_REST = "https://api.binance.com";
const COINBASE_REST = "https://api.exchange.coinbase.com";

const tickerCache = new Map<string, { at: number; data: Ticker[] }>();
const infoCache = new Map<string, { at: number; data: SymbolInfo[] }>();

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "User-Agent": "cryptoz-paper-trading/1.0",
      ...(init?.headers ?? {}),
    },
    signal: init?.signal ?? AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${url} ${body.slice(0, 160)}`);
  }
  return (await res.json()) as T;
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  const n = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

function aggregateCandles(candles: Candle[], groupSec: number): Candle[] {
  const out: Candle[] = [];
  let cur: Candle | null = null;
  let bucket = -1;
  for (const c of candles) {
    const b = c.time - (c.time % groupSec);
    if (b !== bucket) {
      if (cur) out.push(cur);
      bucket = b;
      cur = { time: b, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
    } else if (cur) {
      cur = {
        time: b,
        open: cur.open,
        high: Math.max(cur.high, c.high),
        low: Math.min(cur.low, c.low),
        close: c.close,
        volume: cur.volume + c.volume,
      };
    }
  }
  if (cur) out.push(cur);
  return out;
}

function mapBinanceTicker(t: Record<string, string>): Ticker {
  return {
    symbol: toCanonical(t.symbol),
    price: t.lastPrice,
    priceChange: t.priceChange,
    priceChangePercent: t.priceChangePercent,
    high24h: t.highPrice,
    low24h: t.lowPrice,
    volume: t.volume,
    quoteVolume: t.quoteVolume,
    eventTime: Number(t.closeTime ?? Date.now()),
  };
}

async function binanceTickers(symbols: string[]): Promise<Ticker[]> {
  if (symbols.length === 0) return [];
  if (symbols.length === 1) {
    const s = toBinanceSymbol(symbols[0]);
    const t = await fetchJson<Record<string, string>>(
      `${BINANCE_REST}/api/v3/ticker/24hr?symbol=${s}`,
    );
    return [mapBinanceTicker(t)];
  }
  const list = JSON.stringify(symbols.map(toBinanceSymbol));
  const all = await fetchJson<Array<Record<string, string>>>(
    `${BINANCE_REST}/api/v3/ticker/24hr?symbols=${encodeURIComponent(list)}`,
  );
  return all.map(mapBinanceTicker);
}

async function coinbaseTickers(symbols: string[]): Promise<Ticker[]> {
  const rows = await mapPool(symbols, 6, async (sym) => {
    const product = toCoinbaseProduct(sym);
    const [ticker, stats] = await Promise.all([
      fetchJson<{ price: string; time: string; volume?: string }>(
        `${COINBASE_REST}/products/${product}/ticker`,
      ),
      fetchJson<{ open: string; high: string; low: string; volume: string }>(
        `${COINBASE_REST}/products/${product}/stats`,
      ),
    ]);
    const price = d(ticker.price);
    const open = d(stats.open || ticker.price);
    const change = price.minus(open);
    const pct = open.isZero() ? d(0) : change.div(open).mul(100);
    const volume = d(stats.volume ?? ticker.volume ?? "0");
    return {
      symbol: toCanonical(sym),
      price: price.toString(),
      priceChange: change.toString(),
      priceChangePercent: pct.toFixed(4),
      high24h: stats.high ?? ticker.price,
      low24h: stats.low ?? ticker.price,
      volume: volume.toString(),
      quoteVolume: volume.mul(price).toString(),
      eventTime: ticker.time ? Date.parse(ticker.time) : Date.now(),
    } satisfies Ticker;
  });
  return rows;
}

export async function getTickers(
  provider: DataProviderName,
  symbols: string[],
): Promise<Ticker[]> {
  const key = `${provider}:${symbols.slice().sort().join(",")}`;
  const hit = tickerCache.get(key);
  if (hit && Date.now() - hit.at < 2000) return hit.data;
  const data =
    provider === "binance"
      ? await binanceTickers(symbols)
      : await coinbaseTickers(symbols);
  tickerCache.set(key, { at: Date.now(), data });
  return data;
}

const CB_GRANULARITY: Record<Exclude<Interval, "4h">, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "1d": 86400,
};

async function coinbaseKlines(
  symbol: string,
  interval: Interval,
  limit: number,
  startTimeMs?: number,
): Promise<Candle[]> {
  const product = toCoinbaseProduct(symbol);
  const want = interval === "4h" ? "1h" : interval;
  const gran = CB_GRANULARITY[want as Exclude<Interval, "4h">];
  const fetchLimit = interval === "4h" ? Math.min(limit * 4, 1000) : Math.min(limit, 1000);
  const end = Math.floor(Date.now() / 1000);
  const start = startTimeMs
    ? Math.floor(startTimeMs / 1000)
    : end - fetchLimit * gran;
  const pages: Candle[] = [];
  let cursor = start;
  while (cursor < end && pages.length < fetchLimit) {
    const pageEnd = Math.min(cursor + gran * 280, end);
    const url =
      `${COINBASE_REST}/products/${product}/candles` +
      `?granularity=${gran}&start=${new Date(cursor * 1000).toISOString()}` +
      `&end=${new Date(pageEnd * 1000).toISOString()}`;
    const raw = await fetchJson<number[][]>(url);
    const chunk = raw
      .map((k) => ({
        time: Number(k[0]),
        low: Number(k[1]),
        high: Number(k[2]),
        open: Number(k[3]),
        close: Number(k[4]),
        volume: Number(k[5]),
      }))
      .sort((a, b) => a.time - b.time);
    pages.push(...chunk);
    if (chunk.length === 0) break;
    cursor = chunk[chunk.length - 1].time + gran;
    if (raw.length < 50) break;
  }
  const unique = new Map<number, Candle>();
  for (const c of pages) unique.set(c.time, c);
  let candles = [...unique.values()].sort((a, b) => a.time - b.time);
  if (interval === "4h") candles = aggregateCandles(candles, 14400);
  return candles.slice(-limit);
}

async function binanceKlines(
  symbol: string,
  interval: Interval,
  limit: number,
  startTimeMs?: number,
): Promise<Candle[]> {
  const params = new URLSearchParams({
    symbol: toBinanceSymbol(symbol),
    interval,
    limit: String(Math.min(limit, 1000)),
  });
  if (startTimeMs) params.set("startTime", String(startTimeMs));
  const raw = await fetchJson<unknown[][]>(`${BINANCE_REST}/api/v3/klines?${params}`);
  return raw.map((k) => ({
    time: Math.floor(Number(k[0]) / 1000),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
  }));
}

export async function getKlines(
  provider: DataProviderName,
  symbol: string,
  interval: Interval,
  limit = 500,
  startTimeMs?: number,
): Promise<Candle[]> {
  return provider === "binance"
    ? binanceKlines(symbol, interval, limit, startTimeMs)
    : coinbaseKlines(symbol, interval, limit, startTimeMs);
}

async function binanceInfo(): Promise<SymbolInfo[]> {
  const data = await fetchJson<{
    symbols: Array<{
      symbol: string;
      status: string;
      baseAsset: string;
      quoteAsset: string;
      filters: Array<Record<string, string>>;
    }>;
  }>(`${BINANCE_REST}/api/v3/exchangeInfo`);
  return data.symbols
    .filter((s) => s.status === "TRADING" && s.quoteAsset === "USDT")
    .map((s) => {
      const pf = s.filters.find((f) => f.filterType === "PRICE_FILTER");
      const lf = s.filters.find((f) => f.filterType === "LOT_SIZE");
      return {
        symbol: toCanonical(s.symbol),
        baseAsset: s.baseAsset,
        quoteAsset: "USDT",
        status: s.status,
        tickSize: pf?.tickSize ?? "0.01",
        stepSize: lf?.stepSize ?? "0.0001",
        minQty: lf?.minQty ?? "0.0001",
      };
    });
}

async function coinbaseInfo(): Promise<SymbolInfo[]> {
  const products = await fetchJson<
    Array<{
      id: string;
      base_currency: string;
      quote_currency: string;
      status: string;
      trading_disabled?: boolean;
      quote_increment?: string;
      base_increment?: string;
      base_min_size?: string;
    }>
  >(`${COINBASE_REST}/products`);
  return products
    .filter(
      (p) =>
        p.quote_currency === "USD" &&
        p.status === "online" &&
        !p.trading_disabled,
    )
    .map((p) => ({
      symbol: toCanonical(p.id),
      baseAsset: p.base_currency,
      quoteAsset: "USD",
      status: "TRADING",
      tickSize: p.quote_increment ?? "0.01",
      stepSize: p.base_increment ?? "0.0001",
      minQty: p.base_min_size ?? "0.0001",
    }));
}

export async function getExchangeInfo(
  provider: DataProviderName,
): Promise<SymbolInfo[]> {
  const hit = infoCache.get(provider);
  if (hit && Date.now() - hit.at < 60 * 60 * 1000) return hit.data;
  const data = provider === "binance" ? await binanceInfo() : await coinbaseInfo();
  infoCache.set(provider, { at: Date.now(), data });
  return data;
}

export { INTERVAL_SECONDS, baseAsset };
