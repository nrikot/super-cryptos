import type { DataProviderName } from "@/lib/market/types";
import { binanceWs } from "./binance";
import { coinbaseWs } from "./coinbase";
import type { MarketDataProvider } from "./types";

export type { MarketDataProvider };
export { binanceWs, coinbaseWs };

export function getWsProvider(name: DataProviderName): MarketDataProvider {
  return name === "binance" ? binanceWs : coinbaseWs;
}
