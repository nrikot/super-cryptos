import { createServerFn } from "@tanstack/react-start";
import type { Candle, DataProviderName, Interval, SymbolInfo, Ticker } from "./types";

export const fetchTickers = createServerFn({ method: "POST" })
  .validator((input: { provider: DataProviderName; symbols: string[] }) => input)
  .handler(async ({ data }): Promise<Ticker[]> => {
    const { getTickers } = await import("@/lib/providers/rest.server.ts");
    return getTickers(data.provider, data.symbols);
  });

export const fetchKlines = createServerFn({ method: "POST" })
  .validator(
    (input: {
      provider: DataProviderName;
      symbol: string;
      interval: Interval;
      limit?: number;
      startTimeMs?: number;
    }) => input,
  )
  .handler(async ({ data }): Promise<Candle[]> => {
    const { getKlines } = await import("@/lib/providers/rest.server.ts");
    return getKlines(
      data.provider,
      data.symbol,
      data.interval,
      data.limit,
      data.startTimeMs,
    );
  });

export const fetchExchangeInfo = createServerFn({ method: "POST" })
  .validator((input: { provider: DataProviderName }) => input)
  .handler(async ({ data }): Promise<SymbolInfo[]> => {
    const { getExchangeInfo } = await import("@/lib/providers/rest.server.ts");
    return getExchangeInfo(data.provider);
  });
