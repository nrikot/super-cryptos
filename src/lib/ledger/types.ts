/** Ledger domain types — pure data, no React */

export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit";
export type OrderStatus = "open" | "filled" | "cancelled";

export interface Account {
  cash: string;
  reservedCash: string;
  startingBalance: string;
  quoteCurrency: string;
}

export interface Holding {
  asset: string;
  qty: string;
  reservedQty: string;
  avgEntry: string;
  openedAt: number;
}

export interface Order {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  qty: string;
  limitPrice?: string;
  /** Cash reserved (buy) or qty reserved (sell), as a Decimal string */
  reservedAmount?: string;
  status: OrderStatus;
  createdAt: number;
  filledAt?: number;
  avgFillPrice?: string;
  fee?: string;
  /** Last evaluated 1m kline open time (unix seconds). Idempotency cursor. */
  cursor?: number;
  /** OCO group: when any order in the group fills, the others are cancelled */
  ocoGroupId?: string;
}

/** Closed position lot — source of truth for P&L analytics */
export interface Trade {
  id: string;
  symbol: string;
  openedAt: number;
  closedAt: number;
  qty: string;
  avgEntry: string;
  avgExit: string;
  grossPnl: string;
  fees: string;
  netPnl: string;
}

export interface EquitySnapshot {
  ts: number;
  equity: string;
}

export interface LedgerState {
  account: Account;
  holdings: Record<string, Holding>;
  orders: Order[];
  trades: Trade[];
  snapshots: EquitySnapshot[];
  lastSeen: number;
  /** Trade journal: tradeId → note text */
  journal: Record<string, string>;
}

export class InsufficientHoldingsError extends Error {
  readonly asset: string;
  readonly requested: string;
  readonly available: string;
  constructor(asset: string, requested: string, available: string) {
    super(`Insufficient ${asset} (you hold ${available})`);
    this.name = "InsufficientHoldingsError";
    this.asset = asset;
    this.requested = requested;
    this.available = available;
  }
}

export class InsufficientCashError extends Error {
  readonly required: string;
  readonly available: string;
  constructor(required: string, available: string) {
    super(`Insufficient cash (need ${required}, have ${available})`);
    this.name = "InsufficientCashError";
    this.required = required;
    this.available = available;
  }
}
