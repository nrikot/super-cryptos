import Decimal from "decimal.js";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export const FEE_RATE = new Decimal("0.001"); // 0.1% taker
export const DEFAULT_SLIPPAGE = new Decimal("0.0005"); // 0.05%
export const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
export const MAX_SNAPSHOTS = 2500;

export function d(value: string | number | Decimal): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

export function applySlippage(
  price: Decimal,
  side: "buy" | "sell",
  slippage: Decimal = DEFAULT_SLIPPAGE,
): Decimal {
  return side === "buy"
    ? price.mul(d(1).plus(slippage))
    : price.mul(d(1).minus(slippage));
}

export function calcFee(notional: Decimal): Decimal {
  return notional.mul(FEE_RATE);
}

export function roundToTick(price: Decimal, tickSize: string): Decimal {
  const tick = d(tickSize);
  if (tick.isZero()) return price;
  return price.div(tick).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).mul(tick);
}

export function roundToStep(qty: Decimal, stepSize: string): Decimal {
  const step = d(stepSize);
  if (step.isZero()) return qty;
  return qty.div(step).toDecimalPlaces(0, Decimal.ROUND_DOWN).mul(step);
}

export function baseAsset(symbol: string): string {
  const s = symbol.toUpperCase().replace(/-/g, "");
  if (s.endsWith("USDT")) return s.slice(0, -4);
  if (s.endsWith("USD")) return s.slice(0, -3);
  return s;
}

export function trimZeros(value: string | number | Decimal): string {
  const s = d(value).toFixed(8);
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "");
}

export function availableQty(qty: string, reservedQty: string): Decimal {
  const left = d(qty).minus(d(reservedQty));
  return left.isNegative() ? d(0) : left;
}

export function availableCash(cash: string, reservedCash: string): Decimal {
  const left = d(cash).minus(d(reservedCash));
  return left.isNegative() ? d(0) : left;
}
