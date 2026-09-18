/**
 * Pure ledger functions — NO React / Next / store imports.
 * All money math via decimal.js.
 */

import {
  d,
  applySlippage,
  calcFee,
  roundToTick,
  roundToStep,
  baseAsset,
  Decimal,
  DEFAULT_SLIPPAGE,
  availableCash,
  availableQty,
  trimZeros,
  MAX_SNAPSHOTS,
} from "./math.ts";
import type {
  Account,
  Holding,
  Order,
  Trade,
  LedgerState,
  OrderSide,
  OrderType,
} from "./types.ts";
import { InsufficientHoldingsError, InsufficientCashError } from "./types.ts";

export interface FillParams {
  symbol: string;
  side: OrderSide;
  qty: string;
  /** Latest WS price (string) */
  marketPrice: string;
  tickSize?: string;
  stepSize?: string;
  slippage?: string;
  orderId?: string;
}

export interface LimitParams {
  symbol: string;
  side: OrderSide;
  qty: string;
  limitPrice: string;
  tickSize?: string;
  stepSize?: string;
  orderId?: string;
  /** OCO: stop-loss limit price (must be below current for buy, above for sell) */
  ocoStopPrice?: string;
  /** OCO: take-profit limit price (must be above current for buy, below for sell) */
  ocoTakeProfitPrice?: string;
}

export interface FillResult {
  state: LedgerState;
  order: Order;
  trade: Trade | null;
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function cloneState(state: LedgerState): LedgerState {
  return {
    account: { ...state.account },
    holdings: Object.fromEntries(
      Object.entries(state.holdings).map(([k, v]) => [k, { ...v }]),
    ),
    orders: state.orders.map((o) => ({ ...o })),
    trades: [...state.trades],
    snapshots: [...state.snapshots],
    lastSeen: Date.now(),
    journal: { ...state.journal },
  };
}

export function createInitialState(startingBalance = "10000"): LedgerState {
  return {
    account: {
      cash: startingBalance,
      reservedCash: "0",
      startingBalance,
      quoteCurrency: "USDT",
    },
    holdings: {},
    orders: [],
    trades: [],
    snapshots: [
      { ts: Date.now(), equity: startingBalance },
    ],
    lastSeen: Date.now(),
    journal: {},
  };
}

/**
 * THE only place that converts holdings → quote value.
 */
export function getValuation(
  holdings: Record<string, Holding>,
  prices: Record<string, string>,
): Decimal {
  let total = d(0);
  for (const [asset, h] of Object.entries(holdings)) {
    const price = prices[asset];
    if (!price) continue;
    total = total.plus(d(h.qty).mul(d(price)));
  }
  return total;
}

export function getEquity(
  state: LedgerState,
  prices: Record<string, string>,
): Decimal {
  return d(state.account.cash).plus(getValuation(state.holdings, prices));
}

export function getUnrealized(
  holding: Holding,
  markPrice: string,
): Decimal {
  const value = getValuation(
    { [holding.asset]: holding },
    { [holding.asset]: markPrice },
  );
  const cost = d(holding.qty).mul(d(holding.avgEntry));
  return value.minus(cost);
}

function applyBuyHolding(
  holdings: Record<string, Holding>,
  asset: string,
  qty: Decimal,
  fillPrice: Decimal,
  now: number,
): void {
  const existing = holdings[asset];
  if (existing) {
    const oldQty = d(existing.qty);
    const oldEntry = d(existing.avgEntry);
    const newQty = oldQty.plus(qty);
    const newEntry = oldQty.mul(oldEntry).plus(qty.mul(fillPrice)).div(newQty);
    holdings[asset] = {
      ...existing,
      qty: newQty.toString(),
      avgEntry: newEntry.toString(),
    };
  } else {
    holdings[asset] = {
      asset,
      qty: qty.toString(),
      reservedQty: "0",
      avgEntry: fillPrice.toString(),
      openedAt: now,
    };
  }
}

function writeSellTrade(
  params: {
    symbol: string;
    qty: Decimal;
    fillPrice: Decimal;
    avgEntry: Decimal;
    fee: Decimal;
    openedAt: number;
    now: number;
  },
): Trade {
  const grossPnl = params.fillPrice.minus(params.avgEntry).mul(params.qty);
  const netPnl = grossPnl.minus(params.fee);
  return {
    id: uid(),
    symbol: params.symbol,
    openedAt: params.openedAt,
    closedAt: params.now,
    qty: params.qty.toString(),
    avgEntry: params.avgEntry.toString(),
    avgExit: params.fillPrice.toString(),
    grossPnl: grossPnl.toString(),
    fees: params.fee.toString(),
    netPnl: netPnl.toString(),
  };
}

/**
 * Execute a market order fill.
 * Spot-only: sell > holdings throws InsufficientHoldingsError (one place).
 */
export function executeMarketFill(
  state: LedgerState,
  params: FillParams,
): FillResult {
  const side = params.side;
  const asset = baseAsset(params.symbol);
  const symbol = params.symbol.toUpperCase();
  const step = params.stepSize ?? "0.00000001";
  const qty = roundToStep(d(params.qty), step);
  if (qty.lte(0)) {
    throw new Error("Quantity must be positive after stepSize rounding");
  }

  const rawPrice = d(params.marketPrice);
  const slip = params.slippage ? d(params.slippage) : DEFAULT_SLIPPAGE;
  let fillPrice = applySlippage(rawPrice, side, slip);
  if (params.tickSize) {
    fillPrice = roundToTick(fillPrice, params.tickSize);
  }

  const notional = qty.mul(fillPrice);
  const fee = calcFee(notional);
  const now = Date.now();

  if (side === "sell") {
    const holding = state.holdings[asset];
    const avail = holding
      ? availableQty(holding.qty, holding.reservedQty)
      : d(0);
    if (qty.gt(avail)) {
      throw new InsufficientHoldingsError(
        asset,
        trimZeros(qty),
        trimZeros(avail),
      );
    }
  }

  if (side === "buy") {
    const cost = notional.plus(fee);
    const avail = availableCash(
      state.account.cash,
      state.account.reservedCash,
    );
    if (cost.gt(avail)) {
      throw new InsufficientCashError(trimZeros(cost), trimZeros(avail));
    }
  }

  const next = cloneState(state);

  const order: Order = {
    id: params.orderId ?? uid(),
    symbol,
    side,
    type: "market",
    qty: qty.toString(),
    status: "filled",
    createdAt: now,
    filledAt: now,
    avgFillPrice: fillPrice.toString(),
    fee: fee.toString(),
  };
  next.orders.push(order);

  let trade: Trade | null = null;

  if (side === "buy") {
    next.account.cash = d(next.account.cash).minus(notional).minus(fee).toString();
    applyBuyHolding(next.holdings, asset, qty, fillPrice, now);
  } else {
    next.account.cash = d(next.account.cash).plus(notional).minus(fee).toString();
    const existing = next.holdings[asset]!;
    const remaining = d(existing.qty).minus(qty);
    trade = writeSellTrade({
      symbol,
      qty,
      fillPrice,
      avgEntry: d(existing.avgEntry),
      fee,
      openedAt: existing.openedAt,
      now,
    });
    next.trades.push(trade);
    if (remaining.lte(0)) {
      delete next.holdings[asset];
    } else {
      next.holdings[asset] = {
        ...existing,
        qty: remaining.toString(),
      };
    }
  }

  const afterOco = cancelOcoSiblings(next, order.id);
  return { state: afterOco, order, trade };
}

export function placeLimitOrder(
  state: LedgerState,
  params: LimitParams,
): { state: LedgerState; order: Order } {
  const side = params.side;
  const asset = baseAsset(params.symbol);
  const symbol = params.symbol.toUpperCase();
  const step = params.stepSize ?? "0.00000001";
  const qty = roundToStep(d(params.qty), step);
  if (qty.lte(0)) {
    throw new Error("Quantity must be positive after stepSize rounding");
  }
  let limitPrice = d(params.limitPrice);
  if (params.tickSize) {
    limitPrice = roundToTick(limitPrice, params.tickSize);
  }
  if (limitPrice.lte(0)) {
    throw new Error("Limit price must be positive");
  }

  const notional = qty.mul(limitPrice);
  const fee = calcFee(notional);
  const now = Date.now();
  const next = cloneState(state);
  let order: Order;

  if (side === "buy") {
    const cost = notional.plus(fee);
    const avail = availableCash(
      next.account.cash,
      next.account.reservedCash,
    );
    if (cost.gt(avail)) {
      throw new InsufficientCashError(trimZeros(cost), trimZeros(avail));
    }
    next.account.reservedCash = d(next.account.reservedCash).plus(cost).toString();
    order = {
      id: params.orderId ?? uid(),
      symbol,
      side,
      type: "limit",
      qty: qty.toString(),
      limitPrice: limitPrice.toString(),
      reservedAmount: cost.toString(),
      status: "open",
      createdAt: now,
      cursor: 0,
    };
  } else {
    const holding = next.holdings[asset];
    const avail = holding
      ? availableQty(holding.qty, holding.reservedQty)
      : d(0);
    if (qty.gt(avail)) {
      throw new InsufficientHoldingsError(asset, trimZeros(qty), trimZeros(avail));
    }
    if (!holding) {
      throw new InsufficientHoldingsError(asset, trimZeros(qty), "0");
    }
    holding.reservedQty = d(holding.reservedQty).plus(qty).toString();
    order = {
      id: params.orderId ?? uid(),
      symbol,
      side,
      type: "limit",
      qty: qty.toString(),
      limitPrice: limitPrice.toString(),
      reservedAmount: qty.toString(),
      status: "open",
      createdAt: now,
      cursor: 0,
    };
  }

  next.orders.push(order);

  if (params.ocoStopPrice || params.ocoTakeProfitPrice) {
    const ocoGroupId = uid();
    const ocoSide: OrderSide = side === "buy" ? "sell" : "buy";

    if (params.ocoStopPrice) {
      const stopPx = d(params.ocoStopPrice);
      if (stopPx.gt(0)) {
        const stopOrder: Order = {
          id: uid(),
          symbol,
          side: ocoSide,
          type: "limit",
          qty: qty.toString(),
          limitPrice: (params.tickSize ? roundToTick(stopPx, params.tickSize) : stopPx).toString(),
          status: "open",
          createdAt: now,
          cursor: 0,
          ocoGroupId,
        };
        next.orders.push(stopOrder);
      }
    }

    if (params.ocoTakeProfitPrice) {
      const tpPx = d(params.ocoTakeProfitPrice);
      if (tpPx.gt(0)) {
        const tpOrder: Order = {
          id: uid(),
          symbol,
          side: ocoSide,
          type: "limit",
          qty: qty.toString(),
          limitPrice: (params.tickSize ? roundToTick(tpPx, params.tickSize) : tpPx).toString(),
          status: "open",
          createdAt: now,
          cursor: 0,
          ocoGroupId,
        };
        next.orders.push(tpOrder);
      }
    }
  }

  return { state: next, order: order! };
}

export function cancelOrder(state: LedgerState, orderId: string): LedgerState {
  const idx = state.orders.findIndex((o) => o.id === orderId);
  if (idx < 0) return state;
  const order = state.orders[idx];
  if (order.status !== "open") return state;
  const next = cloneState(state);
  const target = next.orders[idx];
  target.status = "cancelled";
  const reserved = d(target.reservedAmount ?? "0");
  if (target.side === "buy") {
    const nextReserved = d(next.account.reservedCash).minus(reserved);
    next.account.reservedCash = (nextReserved.isNegative() ? d(0) : nextReserved).toString();
  } else {
    const asset = baseAsset(target.symbol);
    const holding = next.holdings[asset];
    if (holding) {
      const nextQty = d(holding.reservedQty).minus(reserved);
      holding.reservedQty = (nextQty.isNegative() ? d(0) : nextQty).toString();
    }
  }
  return next;
}

/**
 * Cancel all open orders in the same OCO group except the given orderId.
 */
function cancelOcoSiblings(state: LedgerState, filledOrderId: string): LedgerState {
  const filled = state.orders.find((o) => o.id === filledOrderId);
  if (!filled?.ocoGroupId) return state;
  let next: LedgerState | null = null;
  for (const order of state.orders) {
    if (order.id === filledOrderId) continue;
    if (order.ocoGroupId !== filled.ocoGroupId) continue;
    if (order.status !== "open") continue;
    if (!next) next = cloneState(state);
    const target = next.orders.find((o) => o.id === order.id);
    if (!target || target.status !== "open") continue;
    target.status = "cancelled";
    const reserved = d(target.reservedAmount ?? "0");
    if (target.side === "buy") {
      const nextReserved = d(next.account.reservedCash).minus(reserved);
      next.account.reservedCash = (nextReserved.isNegative() ? d(0) : nextReserved).toString();
    } else {
      const asset = baseAsset(target.symbol);
      const holding = next.holdings[asset];
      if (holding) {
        const nextQty = d(holding.reservedQty).minus(reserved);
        holding.reservedQty = (nextQty.isNegative() ? d(0) : nextQty).toString();
      }
    }
  }
  return next ?? state;
}

function moreFavorableFill(
  side: OrderSide,
  marketPrice: Decimal,
  limitPrice: Decimal,
): Decimal {
  if (side === "buy") {
    return Decimal.min(marketPrice, limitPrice);
  }
  return Decimal.max(marketPrice, limitPrice);
}

/**
 * Fill a resting limit. Returns null if the order is not open or the price
 * has not crossed. Fill price is limit-or-better.
 */
export function executeLimitFill(
  state: LedgerState,
  orderId: string,
  marketPrice: string,
  opts?: { tickSize?: string; fillAtLimit?: boolean },
): FillResult | null {
  const idx = state.orders.findIndex((o) => o.id === orderId);
  if (idx < 0) return null;
  const existing = state.orders[idx];
  if (existing.status !== "open" || existing.type !== "limit" || !existing.limitPrice) {
    return null;
  }

  const limitPrice = d(existing.limitPrice);
  let px = d(marketPrice);
  if (opts?.tickSize) px = roundToTick(px, opts.tickSize);

  const crossed =
    existing.side === "buy" ? px.lte(limitPrice) : px.gte(limitPrice);
  if (!crossed) return null;

  let fillPrice = opts?.fillAtLimit
    ? limitPrice
    : moreFavorableFill(existing.side, px, limitPrice);
  if (opts?.tickSize) fillPrice = roundToTick(fillPrice, opts.tickSize);

  const qty = d(existing.qty);
  const notional = qty.mul(fillPrice);
  const fee = calcFee(notional);
  const now = Date.now();
  const next = cloneState(state);
  const order = next.orders[idx];
  const asset = baseAsset(order.symbol);
  const reserved = d(order.reservedAmount ?? "0");

  order.status = "filled";
  order.filledAt = now;
  order.avgFillPrice = fillPrice.toString();
  order.fee = fee.toString();

  let trade: Trade | null = null;

  if (order.side === "buy") {
    const actualCost = notional.plus(fee);
    const nextReserved = d(next.account.reservedCash).minus(reserved);
    next.account.reservedCash = (nextReserved.isNegative() ? d(0) : nextReserved).toString();
    next.account.cash = d(next.account.cash).minus(actualCost).toString();
    applyBuyHolding(next.holdings, asset, qty, fillPrice, now);
  } else {
    const holding = next.holdings[asset];
    if (!holding) {
      throw new InsufficientHoldingsError(asset, trimZeros(qty), "0");
    }
    const nextReservedQty = d(holding.reservedQty).minus(reserved);
    holding.reservedQty = (nextReservedQty.isNegative() ? d(0) : nextReservedQty).toString();
    const remaining = d(holding.qty).minus(qty);
    if (remaining.isNegative()) {
      throw new InsufficientHoldingsError(
        asset,
        trimZeros(qty),
        trimZeros(holding.qty),
      );
    }
    next.account.cash = d(next.account.cash).plus(notional).minus(fee).toString();
    trade = writeSellTrade({
      symbol: order.symbol,
      qty,
      fillPrice,
      avgEntry: d(holding.avgEntry),
      fee,
      openedAt: holding.openedAt,
      now,
    });
    next.trades.push(trade);
    if (remaining.lte(0)) {
      delete next.holdings[asset];
    } else {
      next.holdings[asset] = { ...holding, qty: remaining.toString() };
    }
  }

  const afterOco = cancelOcoSiblings(next, order.id);
  return { state: afterOco, order, trade };
}

export function updateOrderCursor(
  state: LedgerState,
  orderId: string,
  cursor: number,
): LedgerState {
  const idx = state.orders.findIndex((o) => o.id === orderId);
  if (idx < 0) return state;
  const next = cloneState(state);
  next.orders[idx] = { ...next.orders[idx], cursor };
  return next;
}

export function recordSnapshot(
  state: LedgerState,
  equity: string,
  ts = Date.now(),
): LedgerState {
  const snaps = state.snapshots;
  const last = snaps[snaps.length - 1];
  if (last && ts - last.ts < 15_000 && last.equity === equity) {
    return { ...state, lastSeen: ts };
  }
  let nextSnaps = [...snaps, { ts, equity }];
  if (nextSnaps.length > MAX_SNAPSHOTS) {
    nextSnaps = nextSnaps.slice(-2000);
  }
  return { ...state, snapshots: nextSnaps, lastSeen: ts };
}

export function resetAccount(
  _state: LedgerState,
  startingBalance = "10000",
): LedgerState {
  return createInitialState(startingBalance);
}

export function buyingPower(account: Account): Decimal {
  return availableCash(account.cash, account.reservedCash);
}

export type { OrderSide, OrderType };
