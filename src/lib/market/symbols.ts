import { baseAsset } from "@/lib/ledger/math";
import type { DataProviderName } from "./types";

export { baseAsset };

/** Canonical form used across the app: BTCUSDT */
export function toCanonical(symbol: string): string {
  const s = symbol.toUpperCase().replace(/[-_/]/g, "");
  if (s.endsWith("USDT")) return s;
  if (s.endsWith("USD")) return `${s.slice(0, -3)}USDT`;
  return s;
}

export function toCoinbaseProduct(canonical: string): string {
  return `${baseAsset(canonical)}-USD`;
}

export function toBinanceSymbol(canonical: string): string {
  return toCanonical(canonical);
}

export function displayPair(
  canonical: string,
  quote: "USD" | "USDT" = "USD",
): string {
  return `${baseAsset(canonical)}/${quote}`;
}

export function quoteLabel(provider: DataProviderName): "USD" | "USDT" {
  return provider === "binance" ? "USDT" : "USD";
}

export function providerProduct(
  canonical: string,
  provider: DataProviderName,
): string {
  return provider === "coinbase"
    ? toCoinbaseProduct(canonical)
    : toBinanceSymbol(canonical);
}
