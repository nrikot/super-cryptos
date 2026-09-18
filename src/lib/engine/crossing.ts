/**
 * Pure crossing detection + backfill. No React / Next / store / network.
 * Shared by the client tick evaluator and (later) a server fill cron.
 */

import { d } from "../ledger/math.ts";
import type { Order } from "../ledger/types.ts";

export interface Kline {
  time: number; // unix seconds (open)
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface CrossingHit {
  filled: boolean;
  /** Last evaluated kline open time (unix seconds) */
  cursor: number;
  /** Unix ms of the filling candle open, when filled */
  fillTime?: number;
}

export function tickCrossesLimit(
  side: "buy" | "sell",
  limitPrice: string,
  marketPrice: string,
): boolean {
  const limit = d(limitPrice);
  const px = d(marketPrice);
  return side === "buy" ? px.lte(limit) : px.gte(limit);
}

/**
 * A 1m candle's high/low proves whether a limit was touched.
 * - buy fills when low ≤ limit (exact touch fills)
 * - sell fills when high ≥ limit
 * - a gap-through (open beyond the limit) still fills, because high/low
 *   contains the open
 * - the first crossing in the window fills; later candles are ignored
 * Idempotent: klines with time ≤ order.cursor are skipped.
 */
export function detectKlineCrossing(
  order: Pick<Order, "side" | "limitPrice" | "cursor" | "status" | "type">,
  klines: Kline[],
): CrossingHit {
  if (
    order.status !== "open" ||
    order.type !== "limit" ||
    !order.limitPrice
  ) {
    return { filled: false, cursor: order.cursor ?? 0 };
  }
  const limit = d(order.limitPrice);
  let cursor = order.cursor ?? 0;
  const sorted = [...klines].sort((a, b) => a.time - b.time);
  for (const k of sorted) {
    if (k.time <= cursor) continue;
    cursor = k.time;
    const crossed =
      order.side === "buy" ? d(k.low).lte(limit) : d(k.high).gte(limit);
    if (crossed) {
      return { filled: true, cursor, fillTime: k.time * 1000 };
    }
  }
  return { filled: false, cursor };
}
