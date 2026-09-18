# SUPER-CRYPTOS

Paper-trade crypto against live market data. Spot only, no shorting, no real money.

The interesting part is the ledger: decimal.js money math, weighted-average entries, lot-closing `trades` rows (the only source of truth for win rate / profit factor), and a kline-crossing fill engine that is isomorphic — the same pure functions run in the browser now and can run in a server evaluator later.

---

## How SUPER-CRYPTOS Works

### What It Is

[SUPER-CRYPTOS](https://supercryptos-nine.vercel.app/) is a **paper-trading dashboard** developed by N Riko Trihendrawan - it shows you live cryptocurrency prices from real exchanges (either Binance or Coinbase), lets you place simulated trades with fake money paper and tracks your portfolio performance over time.

No real money is involved. No real exchange accounts. It's a simulator that uses real market data.

### The Big Picture

#### What you see when you open the app

1. **A header bar** at the top showing your total portfolio value, how much cash you have, and your profit/loss for the day.

2. **A grid of price tiles** — each tile shows a cryptocurrency (like Bitcoin, Ethereum, Polkadot, Solana, Polygon) with its live price, daily change and a mini sparkline chart. Prices flash green or red when they move.

3. **A big candlestick chart** — this is the detailed price chart for whichever coin you've selected. You can switch between timeframes (1 minute, 5 minutes, 15 minutes, 1 hour, 4 hours, 1 day). Candlesticks show you the open, high, low, and close price for each time period.

4. **A trade panel** — where you buy or sell. You can place:
   - **Market orders** — buy/sell immediately at the current price
   - **Limit orders** — buy only if the price drops to your target, or sell only if it rises to your target
   - **Stop-loss / Take-profit** — automatic sell triggers that protect you from losses or lock in profits (OCO — One Cancels Other)

5. **An order book** — shows the 20 best buy and sell prices from the real exchange, plus a stream of recent trades. This is the "depth" view.

6. **A positions table** — shows what you currently hold, how much you're up or down, and lets you close positions with one click.

7. **A fills table** — every trade you've ever made, with timestamps, prices, and fees.

8. **An analytics panel** — your equity curve (portfolio value over time) and stats like win rate, profit factor, average win/loss, and total fees paid.

#### How paper trading works

- You start with **$10,000** in paper USDT (you can reset to a different amount).
- When you **buy**, the app deducts the cost (price × quantity + 0.1% fee) from your cash and gives you the cryptocurrency.
- When you **sell**, the app gives you back the proceeds (price × quantity − 0.1% fee) and takes away the cryptocurrency.
- The app **rejects** any sell that would give you negative holdings — you can't short, you can only sell what you own.
- **Limit orders** reserve your cash (for buys) or your holdings (for sells) so you can't accidentally overspend.
- If you place a limit order and close the browser, the app checks what happened while you were away when you come back (this is called "backfill").

#### What stays when you close the browser

Everything. Your account, trade history, open orders, chart preferences, and settings are saved in your browser's localStorage. When you come back, you pick up exactly where you left off.

---

## Tech Stack

| Layer        | Technology                          | Why                                                         |
| ------------ | ----------------------------------- | ----------------------------------------------------------- |
| Framework    | Vite + TanStack Start + React       | File-based routing, server functions for REST proxy, HMR    |
| Language     | TypeScript (strict)                 | Type safety across the entire stack                         |
| Styling      | Tailwind v4 + shadcn/ui             | Utility-first CSS, dark mode default, consistent components |
| Charts       | lightweight-charts v5 (TradingView) | Professional candlestick charts, client-only dynamic import |
| State        | Zustand + localStorage persistence  | Simple global state, persisted across sessions              |
| Server State | TanStack React Query                | REST polling, caching, retry logic                          |
| Tables       | TanStack React Table                | Sortable positions/fills/lots tables                        |
| Math         | decimal.js                          | IEEE-754-accurate money math — never native floats          |
| Tests        | Node.js built-in `node:test`        | Pure function tests for ledger/engine (no Vitest)           |
| Auth         | better-auth                         | OAuth + session management (M6)                             |

## Project Structure

```
src/
├── routes/                    # TanStack file-based routes
│   ├── __root.tsx             # Root layout: providers, theme, auth
│   └── index.tsx              # "/" → <Dashboard />
│
├── lib/                       # Core logic (no React components here)
│   ├── ledger/                # ★ PURE FUNCTIONS — the heart of the app
│   │   ├── ledger.ts          # Account, fills, valuation, lot-closing
│   │   ├── math.ts            # decimal.js wrappers, fee/slippage constants
│   │   └── types.ts           # Domain types: Order, Trade, Holding, Account
│   │
│   ├── engine/                # ★ PURE FUNCTIONS — crossing detection
│   │   └── crossing.ts        # tickCrossesLimit, detectKlineCrossing
│   │
│   ├── analytics/             # ★ PURE FUNCTIONS — derived P&L
│   │   └── pnl.ts             # computeAnalytics, change24h
│   │
│   ├── providers/             # Exchange data layer
│   │   ├── types.ts           # MarketDataProvider interface
│   │   ├── binance.ts         # Binance WebSocket provider
│   │   ├── coinbase.ts        # Coinbase WebSocket provider
│   │   └── rest.server.ts     # Server-only REST proxy (TanStack server fn)
│   │
│   ├── market/                # Symbol normalization, exchangeInfo cache
│   │   ├── types.ts           # Ticker, Candle, SymbolInfo, Interval types
│   │   ├── api.ts             # Server functions (createServerFn wrappers)
│   │   └── symbols.ts         # toCanonical, toCoinbaseProduct, etc.
│   │
│   ├── ws/                    # WebSocket layer (client-only)
│   │   ├── manager.ts         # Combined stream manager, heartbeat, reconnect
│   │   └── depth-tape-ws.ts   # Separate WS for order book + aggTrade
│   │
│   ├── stores/                # Zustand stores + localStorage persistence
│   │   ├── ledger-store.ts    # Account state, place/cancel/fill actions
│   │   ├── market-store.ts    # Live tickers, sparklines, WS status
│   │   ├── prefs-store.ts     # Watchlist, selected pair, interval, theme
│   │   ├── alerts-store.ts    # Price alerts (persisted)
│   │   └── depth-tape-store.ts # Order book + recent trades (ephemeral)
│   │
│   ├── auth/                  # better-auth integration
│   │   ├── client.ts          # Auth client config
│   │   ├── provider.tsx       # Passthrough AuthProvider
│   │   ├── gates.tsx          # SignedIn/SignedOut gate components
│   │   └── use-current-user.ts # Dev fallback user
│   │
│   ├── csv.ts                 # CSV export (fills + trades)
│   ├── format.ts              # Price/money/percent formatting
│   ├── error-component.tsx    # Error boundary fallback UI
│   └── utils.ts               # cn() helper
│
├── hooks/                     # Custom React hooks
│   ├── use-trading-session.ts # ★ MAIN ORCHESTRATOR — wires everything together
│   ├── use-depth-tape.ts      # Connects depth WS to store
│   ├── use-price-alerts.ts    # Evaluates alerts on ticker updates
│   └── use-theme.ts           # Applies theme class to <html>
│
├── components/
│   ├── dashboard/             # Dashboard panels
│   │   ├── dashboard.tsx      # Layout: header, grid, chart, trade, tables
│   │   ├── header.tsx         # Equity stats, provider/theme toggles
│   │   ├── ticker-grid.tsx    # Price tiles grid
│   │   ├── candle-chart.tsx   # Lightweight-charts candlestick
│   │   ├── trade-panel.tsx    # Buy/sell form (market/limit/OCO)
│   │   ├── depth-tape-panel.tsx # Order book + aggTrade stream
│   │   ├── analytics-panel.tsx # Equity curve + P&L stats
│   │   ├── tables.tsx         # Positions, orders, fills, lots tabs
│   │   ├── price-alerts.tsx   # Alert management UI
│   │   └── pair-search.tsx    # Search + pin symbols
│   └── ui/                    # shadcn primitives (button, dialog, etc.)
│
├── routes/
│   └── __root.tsx             # HTML shell, providers, theme
│
└── styles.css                 # Tailwind + CSS custom properties (dark/light)
```

**Critical rule:** `src/lib/ledger/`, `src/lib/engine/`, and `src/lib/analytics/` are **pure functions** with zero imports from React, stores, or network clients. They run identically in the browser and on a server (M7).

---

## Data Flow

### Data Flow: Market Data

This is how live prices get from the exchange to your screen:

```
Exchange (Binance/Coinbase)
    │
    ├─ WebSocket ──────────────────────┐
    │   (live ticker stream)           │
    │                                  ▼
    │                          WsManager (src/lib/ws/manager.ts)
    │                          - Single connection, combined streams
    │                          - Heartbeat ping every 3 min
    │                          - Auto-reconnect on drop
    │                                  │
    │                          onTicker callback
    │                                  │
    │                                  ▼
    │                          MarketStore (src/lib/stores/market-store.ts)
    │                          - upsertTicker(t) → updates tickers map
    │                          - Computes sparkline data (42 points)
    │                          - Computes flash direction (green/red)
    │                                  │
    │                                  ▼
    │                          React components re-render
    │                          - TickerGrid shows live prices
    │                          - CandleChart applies live price to last candle
    │                          - Header shows equity/cash/24h
    │
    └─ REST API ──────────────────────┐
        (klines, tickers, exchangeInfo)│
                                       ▼
                           TanStack React Query
                           - queryKey: ["klines", provider, symbol, interval]
                           - Polls every 4s when WS is down
                           - Caches exchangeInfo for 1 hour
                                       │
                                       ▼
                           use-trading-session.ts
                           - klinesQuery.data → CandleChart
                           - tickersQuery.data → MarketStore
                           - infoQuery.data → tickSize/stepSize for fills
```

**Key points:**

- The WebSocket is the **primary** source for live prices (sub-second updates).
- REST is the **fallback** when WS is disconnected, and the **only** source for historical klines (chart data).
- Exchange info (tick sizes, step sizes) is cached for 1 hour — it rarely changes.
- The WS connects **directly from the browser to the exchange** — no server proxy needed for WebSocket.

---

### Data Flow: Trading

When you click "Buy" or "Sell":

```
User clicks Buy/Sell
    │
    ▼
TradePanel (src/components/dashboard/trade-panel.tsx)
    │
    ├─ Market order ──────────────────────────────────────┐
    │   - Computes qty from notional or % of holdings     │
    │   - Shows preview: cost, fee, slippage              │
    │   - Calls ledgerStore.placeMarket(args)             │
    │                                                     │
    ├─ Limit order ───────────────────────────────────────┤
    │   - Same qty calculation                            │
    │   - Optionally: OCO stop-loss + take-profit prices  │
    │   - Calls ledgerStore.placeLimit(args)              │
    │                                                     │
    └─ OCO (stop-loss / take-profit) ────────────────────┘
        - Two limit orders with shared ocoGroupId
        - When one fills, the other is auto-cancelled
        │
        ▼
LedgerStore (src/lib/stores/ledger-store.ts)
    │
    │  Calls PURE functions from ledger.ts:
    │
    ├─ executeMarketFill(state, params)
    │   1. Round qty to stepSize (ROUND_DOWN)
    │   2. Apply slippage to price: buy ×(1+0.05%), sell ×(1−0.05%)
    │   3. Round price to tickSize (ROUND_HALF_UP)
    │   4. Check balance: sell > holdings? → throw InsufficientHoldingsError
    │   5. Deduct/add cash, update holdings (weighted-average)
    │   6. Write Order with status "filled"
    │   7. If sell: write Trade row (grossPnl, fees, netPnl)
    │   8. Cancel any OCO siblings
    │
    ├─ placeLimitOrder(state, params)
    │   1. Same rounding/slippage as market
    │   2. Reserve cash (buy) or qty (sell)
    │   3. Create Order with status "open"
    │   4. Create OCO siblings if stop/take-profit provided
    │
    └─ executeLimitFill(state, orderId, marketPrice)
        1. Check crossing: buy (market ≤ limit), sell (market ≥ limit)
        2. Fill at limit price (limit-or-better)
        3. Release reservations
        4. Same balance/holdings updates as market fill
        │
        ▼
localStorage (schemaVersion = 2)
    - Full state serialized to JSON
    - Migrated on version bump (never wipes user data)
```

**The fill path in detail (market order):**

1. **Rounding** — Quantities are rounded DOWN to `stepSize` (e.g., 0.001 BTC). Prices are rounded HALF_UP to `tickSize` (e.g., $0.01). This matches how real exchanges handle orders.

2. **Slippage** — Market orders are priced off the last feed price × (1 ± 0.05%). This simulates real market impact. The slippage is configurable.

3. **Fee** — 0.1% of the notional value (qty × price). Applied on both buy and sell.

4. **Weighted-average entry** — When you buy the same asset at different prices, the app computes a weighted average. If you buy 1 BTC at $50,000 and 1 BTC at $60,000, your avg entry is $55,000.

5. **Lot closing** — When you sell, a `Trade` row is written with the P&L. This is the **only** source of truth for win rate, profit factor, and all analytics. Raw order legs are never used for analytics.

6. **Over-sell rejection** — If you try to sell more than you hold, the app throws `InsufficientHoldingsError` with a clear message like "Insufficient BTC (you hold 0.25)".

---

### The Ledger Engine

**Location:** `src/lib/ledger/ledger.ts` (609 lines)

This is the most important code in the project. It is:

- **Pure** — zero side effects, zero imports from React/stores/network
- **Isomorphic** — runs identically in the browser (M0–M6) and on a server (M7)
- **Tested** — 82 test cases covering every edge case

Key functions:

| Function                                  | Purpose                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `createInitialState(balance)`             | Creates a fresh account with $10,000 USDT                              |
| `executeMarketFill(state, params)`        | Processes a market order: rounds, fees, updates holdings, writes Trade |
| `placeLimitOrder(state, params)`          | Creates a limit order with reserved funds/holdings                     |
| `executeLimitFill(state, orderId, price)` | Fills a limit order at limit-or-better price                           |
| `cancelOrder(state, orderId)`             | Cancels an open order, releases reservations                           |
| `cancelOcoSiblings(state, filledId)`      | Cancels all open orders in the same OCO group                          |
| `getValuation(holdings, prices)`          | Sums qty × price for all holdings                                      |
| `getEquity(state, prices)`                | Cash + valuation                                                       |
| `getUnrealized(holding, markPrice)`       | Current value − cost basis                                             |
| `recordSnapshot(state, equity)`           | Records equity point (deduped, capped at 2500)                         |

**How holdings work:**

```
Holding {
  asset: "BTC"
  qty: "1.5"           ← how much you own
  reservedQty: "0.3"   ← locked by open sell orders
  avgEntry: "55000"    ← weighted-average buy price
  openedAt: 1234567890 ← first buy timestamp
}
```

When you buy 0.5 BTC at $50,000 and then 1.0 BTC at $60,000:

- Total qty: 1.5 BTC
- Weighted avg: (0.5 × 50000 + 1.0 × 60000) / 1.5 = $56,666.67

When you sell 0.3 BTC, a `Trade` row is written:

```
Trade {
  symbol: "BTCUSDT"
  qty: "0.3"
  avgEntry: "56666.67"     ← your cost basis
  avgExit: "58000"         ← what you sold at
  grossPnl: "400"          ← (58000 − 56666.67) × 0.3
  fees: "17.40"            ← 0.1% of 58000 × 0.3
  netPnl: "382.60"         ← grossPnl − fees
}
```

---

### The Fill Engine

**Location:** `src/lib/engine/crossing.ts` (68 lines)

Also pure functions, also isomorphic. Two crossing detection modes:

**1. Tick-based (real-time):**

```typescript
tickCrossesLimit(side, limitPrice, marketPrice);
```

Called on every WS ticker update. Buy fills when `marketPrice ≤ limitPrice`. Sell fills when `marketPrice ≥ limitPrice`. This is instant — fills happen within milliseconds of the price touching your limit.

**2. Kline-based (backfill):**

```typescript
detectKlineCrossing(order, klines);
```

Used when the app was closed and needs to catch up. Fetches 1-minute candles from the order creation time, then checks each candle:

- **Exact touch:** `low ≤ limit` for buy, `high ≥ limit` for sell
- **Gap-through:** If the candle opens beyond the limit, the high/low still contains the crossing, so it fills
- **Idempotency:** Skips klines already evaluated (tracked by `cursor` — the last evaluated kline's open time)
- **Single fill:** Only the first crossing fills; subsequent klines in the window are ignored

This gives ~1-minute granularity. It's a deliberate trade-off documented in the README: fills happen at limit price (favorable), not at the exact tick price.

---

### State Management

Three Zustand stores, all persisted to localStorage:

#### 1. Ledger Store (`cryptoz-ledger`, schemaVersion 2)

The source of truth for your account:

```typescript
LedgerState {
  account: {
    cash: "8500"              ← available USDT
    reservedCash: "1200"      ← locked by open buy orders
    startingBalance: "10000"
    quoteCurrency: "USDT"
  }
  holdings: [                 ← what you own
    { asset: "BTC", qty: "0.5", reservedQty: "0", avgEntry: "55000", ... }
  ]
  orders: [                   ← all orders (open + filled + cancelled)
    { id: "...", symbol: "BTCUSDT", side: "buy", type: "limit", status: "open", ... }
  ]
  trades: [                   ← closed lot P&L rows (analytics source of truth)
    { id: "...", symbol: "BTCUSDT", qty: "0.3", avgEntry: "56666", avgExit: "58000", netPnl: "382", ... }
  ]
  snapshots: [                ← equity time series (max 2500 points)
    { ts: 1234567890, equity: "10234" }
  ]
  journal: {                  ← trade notes
    "trade-id-123": "Bought during dip, sold on bounce"
  }
}
```

#### 2. Market Store (ephemeral — not persisted)

Live market data:

```typescript
{
  tickers: { BTCUSDT: { price: "58000", ... } }
  sparks: { BTCUSDT: [57900, 57950, 58000, ...] }   ← last 42 prices
  flashes: { BTCUSDT: "up" }                          ← green/red flash
  wsStatus: "connected"
}
```

#### 3. Prefs Store (`cryptoz-prefs`, version 2)

User preferences:

```typescript
{
  watchlist: ["BTCUSDT", "ETHUSDT", "SOLUSDT", ...]   ← 12 default symbols
  selectedSymbol: "BTCUSDT"
  provider: "binance"
  interval: "1h"
  theme: "dark"
}
```

#### 4. Alerts Store (`cryptoz-alerts`, version 1)

Price alerts:

```typescript
{
  alerts: [
    {
      id: '...',
      symbol: 'BTCUSDT',
      targetPrice: '60000',
      direction: 'above',
      triggered: false,
    },
  ];
}
```

---

### WebSocket Management

**Location:** `src/lib/ws/manager.ts`

The WS manager handles the browser → exchange connection:

```
Browser ←─────────── WebSocket ──────────── Exchange
         (single connection, combined streams)
```

**How it works:**

1. **Connect** — Opens one WebSocket connection to `wss://stream.binance.com:9443/stream` (or Coinbase equivalent).

2. **Subscribe** — Sends a SUBSCRIBE message with all watchlist symbols:

   ```json
   { "method": "SUBSCRIBE", "params": ["btcusdt@ticker", "ethusdt@ticker"] }
   ```

3. **Heartbeat** — Every 3 minutes, sends a ping (Binance: `LIST_SUBSCRIPTIONS`; Coinbase: receives heartbeat messages). If no pong within 10 seconds, marks as disconnected.

4. **Reconnect** — On connection drop, reconnects with exponential backoff (1s → 2s → 4s → 8s → 16s → 30s max).

5. **Lazy subscribe/unsubscribe** — When you add or remove a symbol from the watchlist, the manager sends individual SUBSCRIBE/UNSUBSCRIBE messages without reconnecting the entire socket.

**Why not REST for live prices?** REST polling at sub-second intervals would hit rate limits (Binance: 6000 weight/min, `/ticker/24hr` = 80 weight). A single WS connection handles thousands of updates per second with no rate limit concerns.

---

### REST API Layer

**Server functions:** `src/lib/market/api.ts`

REST calls go through TanStack Start server functions (proxy pattern):

```
Browser → createServerFn → rest.server.ts → Exchange REST API → Response → Browser
```

This avoids CORS issues (the server makes the request, not the browser).

**What REST is used for:**

| Endpoint               | Frequency               | Purpose                                   |
| ---------------------- | ----------------------- | ----------------------------------------- |
| `/api/v3/klines`       | On pair/interval change | Historical candlestick data for chart     |
| `/api/v3/ticker/24hr`  | Every 4s (WS down only) | Fallback ticker data                      |
| `/api/v3/exchangeInfo` | Once per hour           | Tick sizes, step sizes for order rounding |

**Caching:**

- Tickers: 2-second TTL (prevents duplicate fetches)
- Exchange info: 1-hour TTL (rarely changes, heavy endpoint)

---

### Order Book Depth & Trade Tape

**Location:** `src/lib/ws/depth-tape-ws.ts` + `src/lib/stores/depth-tape-store.ts`

A separate WebSocket connection (Binance only) for the selected pair:

```
wss://stream.binance.com:9443/stream?streams=btcusdt@depth20@100ms/btcusdt@aggTrade
```

- **`@depth20@100ms`** — Top 20 bid/ask levels, updated every 100ms
- **`@aggTrade`** — Individual trades aggregated by price

The depth snapshot shows the order book (bids green, asks red). The trade tape shows recent trades (buys green, sells red) with price and quantity.

This is a **separate** WebSocket from the main ticker stream — it only subscribes to the currently selected pair to avoid bandwidth waste.

---

### Price Alerts & Notifications

**Location:** `src/lib/stores/alerts-store.ts` + `src/hooks/use-price-alerts.ts`

Flow:

1. User creates an alert: "Alert me when BTCUSDT goes above $60,000"
2. Alert is saved to `alerts-store` and persisted in localStorage
3. On every WS ticker update, `usePriceAlerts` checks all alerts for the updated symbol
4. If the price crosses the target direction, the alert fires:
   - Browser notification (`Notification.requestPermission()`)
   - Sonner toast popup
   - Alert is marked as triggered (won't fire again)

---

### Auth

**Location:** `src/lib/auth/`

Uses **better-auth** with OAuth (Google, GitHub, etc.):

- `AuthProvider` wraps the app (currently a passthrough when `VITE_AUTH_ENABLED=false`)
- `SignedIn` / `SignedOut` gate components control what's visible
- In development (`VITE_AUTH_ENABLED=false`), a `DEV_USER` is used so you don't need to sign in
- Session persistence via cookies (server) + local state (client)
- Sign-out clears both client state and server cookie

---

### Theme System

**Location:** `src/styles.css` + `src/hooks/use-theme.ts` + `src/components/theme-effect.tsx`

Three themes: **Dark** (default), **Light**, **System**.

How it works:

1. CSS custom properties define all colors (e.g., `--color-background`, `--color-foreground`)
2. The `.light` class on `<html>` overrides these with light-mode values
3. `useTheme` hook applies the appropriate class based on the user's choice
4. System theme listens to `prefers-color-scheme` media query
5. Theme preference is persisted in `prefs-store` (localStorage)
6. The Toaster (sonner) also switches theme dynamically

---

### Persistence

**Strategy:** Everything in localStorage with `schemaVersion` for safe migrations.

| Store  | Key              | Schema Version | Budget                                        |
| ------ | ---------------- | -------------- | --------------------------------------------- |
| Ledger | `cryptoz-ledger` | 2              | ~4MB (equity snapshots are the main consumer) |
| Prefs  | `cryptoz-prefs`  | 2              | ~1KB                                          |
| Alerts | `cryptoz-alerts` | 1              | ~10KB                                         |

**Migration rules:**

- On load, check `schemaVersion` — if it doesn't match the expected version, run migration
- **Never wipe user data** — migrations normalize fields, add defaults, but preserve everything
- Equity snapshots are capped at 2500 points (sliced to 2000 when exceeded) to stay under the 5MB localStorage limit

**Equity snapshot cadence:**

- On every trade (buy/sell/cancel)
- Every 5 minutes (timer)
- On tab hide (visibility change)

This gives ~500 data points per day of active use — enough for a smooth equity curve without blowing the localStorage budget.

---

### Analytics & P&L

**Location:** `src/lib/analytics/pnl.ts`

All analytics are computed from `trades` rows — **never** from raw order legs.

```
computeAnalytics(trades, holdings, prices) → {
  realizedPnl     // Sum of all trade netPnls
  unrealizedPnl   // Sum of (currentPrice − avgEntry) × qty for all holdings
  winRate         // % of trades with positive netPnl
  profitFactor    // Gross wins ÷ Gross losses
  avgWin          // Average netPnl of winning trades
  avgLoss         // Average netPnl of losing trades
  bestTrade       // Highest single-trade netPnl
  worstTrade      // Lowest single-trade netPnl
  totalFees       // Sum of all trade fees
  tradeCount      // Total closed trades
}
```

**The equity curve** is built from `snapshots[]` — time-series of total portfolio value (cash + holdings valued at current market prices). Rendered as an area chart using Recharts.

---

### CSV Export

**Location:** `src/lib/csv.ts`

Two export functions:

1. **`exportFillsCsv(fills)`** — All order fills: Time, Pair, Side, Type, Qty, Fill Price, Fee
2. **`exportTradesCsv(trades, journal?)`** — Closed lots: Closed, Pair, Qty, Avg Entry, Avg Exit, Gross PnL, Fees, Net PnL, Journal

Uses `Blob` + `createElement("a")` for client-side download — no server needed.

---

## Key Design Decisions

### 1. Pure functions for ledger and engine

The ledger (`ledger.ts`) and crossing engine (`crossing.ts`) have **zero imports** from React, stores, or network clients. This means:

- They can run in the browser (M0–M6)
- They can run on a server (M7) with identical results
- They can be tested without mocks
- They are the most reliable code in the project

### 2. `trades` table as the only P&L source

Analytics are computed from `trades` rows, not from `orders`. This is because:

- A single order can partially fill multiple times
- Each fill creates a separate lot
- The `trades` table aggregates these into closed lots with correct weighted-average entry/exit
- Raw order legs would give misleading win rates

### 3. Server functions for REST (not client-side)

REST calls go through TanStack Start server functions because:

- Avoids CORS issues (exchange APIs don't allow browser-origin requests in all cases)
- Avoids geo-blocking (Binance is blocked from some regions; the server can use a different network path)
- Keeps API keys (if any) server-side
- The WS still connects directly from the browser (no server-side sockets needed)

### 4. Decimal.js everywhere

Every price, quantity, fee, and P&L calculation uses `decimal.js`. Native JavaScript floats would cause rounding errors that compound over thousands of trades — unacceptable for a trading simulator where accuracy is the whole point.

### 5. Idempotent fills

Limit orders use a `cursor` field (the last evaluated kline's open time) to prevent duplicate fills. This is critical because:

- Backfill re-fetches the same klines
- Tick evaluation can trigger multiple times per second
- The app can be closed and reopened multiple times

### 6. OCO (One Cancels Other) for stop-loss/take-profit

Stop-loss and take-profit are implemented as sibling limit orders with a shared `ocoGroupId`. When one fills, the other is automatically cancelled. This is simpler and more reliable than trying to manage a single order with conditional logic.

---

## Glossary

| Term                 | Meaning                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------- |
| **Candlestick**      | A chart element showing open/high/low/close prices for a time period                        |
| **Fill**             | An order that has been executed (matched with a price)                                      |
| **Lot**              | A group of buys/sells that have been closed into a single P&L record                        |
| **Weighted average** | Entry price computed as total cost ÷ total qty across multiple buys                         |
| **Tick size**        | Minimum price increment (e.g., $0.01)                                                       |
| **Step size**        | Minimum quantity increment (e.g., 0.001 BTC)                                                |
| **Slippage**         | Price difference between expected and actual fill (simulates market impact)                 |
| **OCO**              | One Cancels Other — filling one order auto-cancels its sibling                              |
| **Backfill**         | Checking for fills that happened while the app was closed                                   |
| **Equity**           | Total portfolio value: cash + all holdings at current market prices                         |
| **Realized P&L**     | Profit/loss from closed trades (actual gains/losses)                                        |
| **Unrealized P&L**   | Paper profit/loss on open positions (changes with market)                                   |
| **Win rate**         | % of closed trades that were profitable                                                     |
| **Profit factor**    | Gross wins ÷ gross losses (>1 = profitable overall)                                         |
| **Crossing**         | When the market price touches or passes a limit order's price                               |
| **Idempotency**      | Ensuring the same fill doesn't happen twice, even if evaluated multiple times               |
| **Schema version**   | A number stored with localStorage data; bumped when data shape changes to trigger migration |

---

## Running locally

```bash
npm install
cp .env.example .env    # VITE_DATA_PROVIDER=binance (or coinbase)
npm run dev             # http://localhost:8080
```

## Commands

```bash
npm run build          # production build + DB migration
npm run test           # node:test — 82/82 ledger + engine tests
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm run format         # prettier
```

## Generate Screenshots

```bash
npx playwright install chromium   # one-time: download browser
npm run dev                        # terminal 1: start dev server
node scripts/browser-smoke.mjs    # terminal 2: takes screenshots
```

Output goes to `screenshots/app-builder-preview.png` + `screenshots/app-builder-preview-mobile.png` + `screenshots/app-builder-preview.json`.
