import { d, Decimal, trimZeros } from "@/lib/ledger/math";

export function formatPrice(value: string | number | Decimal): string {
  const x = d(value);
  const abs = x.abs();
  if (abs.gte(1000)) return x.toFixed(2);
  if (abs.gte(1)) return x.toFixed(4);
  if (abs.gte(0.01)) return x.toFixed(5);
  return x.toFixed(8);
}

export function formatMoney(
  value: string | number | Decimal,
  digits = 2,
): string {
  const x = d(value);
  const neg = x.isNegative();
  const n = x.abs().toFixed(digits);
  const [int, frac] = n.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = frac != null ? `${grouped}.${frac}` : grouped;
  return `${neg ? "-" : ""}$${body}`;
}

export function formatPct(
  value: string | number | Decimal,
  digits = 2,
): string {
  const x = d(value);
  const sign = x.gt(0) ? "+" : "";
  return `${sign}${x.toFixed(digits)}%`;
}

export function formatQty(value: string | number | Decimal): string {
  return trimZeros(value);
}

export function formatSignedMoney(value: string | number | Decimal): string {
  const x = d(value);
  const sign = x.gt(0) ? "+" : x.lt(0) ? "−" : "";
  const body = formatMoney(x.abs());
  return `${sign}${body}`;
}

export function compactUsd(value: string | number | Decimal): string {
  const x = d(value);
  const abs = x.abs();
  const sign = x.isNegative() ? "-" : "";
  if (abs.gte(1_000_000_000)) return `${sign}$${abs.div(1e9).toFixed(2)}B`;
  if (abs.gte(1_000_000)) return `${sign}$${abs.div(1e6).toFixed(2)}M`;
  if (abs.gte(10_000)) return `${sign}$${abs.div(1e3).toFixed(1)}K`;
  return formatMoney(x);
}

export { d, Decimal };
