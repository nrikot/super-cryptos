import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createInitialState,
  executeMarketFill,
  executeLimitFill,
  placeLimitOrder,
  cancelOrder,
  getValuation,
  getEquity,
  getUnrealized,
} from "./ledger.ts";
import { InsufficientHoldingsError, InsufficientCashError } from "./types.ts";
import { d } from "./math.ts";

describe("ledger market fills", () => {
  it("buy increases holding and reduces cash", () => {
    let state = createInitialState("10000");
    const result = executeMarketFill(state, {
      symbol: "BTCUSDT",
      side: "buy",
      qty: "0.1",
      marketPrice: "50000",
      slippage: "0",
    });
    state = result.state;
    assert.equal(d(state.account.cash).toNumber(), 4995);
    assert.equal(state.holdings.BTC.qty, "0.1");
    assert.equal(state.holdings.BTC.avgEntry, "50000");
    assert.equal(result.order.status, "filled");
    assert.equal(result.trade, null);
  });

  it("weighted avg entry across two buys", () => {
    let state = createInitialState("200000");
    state = executeMarketFill(state, {
      symbol: "BTCUSDT",
      side: "buy",
      qty: "1",
      marketPrice: "40000",
      slippage: "0",
    }).state;
    state = executeMarketFill(state, {
      symbol: "BTCUSDT",
      side: "buy",
      qty: "1",
      marketPrice: "60000",
      slippage: "0",
    }).state;
    assert.equal(state.holdings.BTC.qty, "2");
    assert.equal(d(state.holdings.BTC.avgEntry).toNumber(), 50000);
  });

  it("partial sell realizes PnL and keeps remaining holding", () => {
    let state = createInitialState("100000");
    state = executeMarketFill(state, {
      symbol: "BTCUSDT",
      side: "buy",
      qty: "1",
      marketPrice: "40000",
      slippage: "0",
    }).state;
    const result = executeMarketFill(state, {
      symbol: "BTCUSDT",
      side: "sell",
      qty: "0.4",
      marketPrice: "50000",
      slippage: "0",
    });
    state = result.state;
    assert.equal(state.holdings.BTC.qty, "0.6");
    assert.ok(result.trade);
    assert.equal(d(result.trade!.grossPnl).toNumber(), 4000);
    assert.equal(d(result.trade!.fees).toNumber(), 20);
    assert.equal(d(result.trade!.netPnl).toNumber(), 3980);
  });

  it("full close removes holding and writes trade", () => {
    let state = createInitialState("100000");
    state = executeMarketFill(state, {
      symbol: "BTCUSDT",
      side: "buy",
      qty: "0.5",
      marketPrice: "40000",
      slippage: "0",
    }).state;
    const result = executeMarketFill(state, {
      symbol: "BTCUSDT",
      side: "sell",
      qty: "0.5",
      marketPrice: "45000",
      slippage: "0",
    });
    assert.equal(result.state.holdings.BTC, undefined);
    assert.ok(result.trade);
    assert.equal(result.state.trades.length, 1);
  });

  it("partial fill then partial close then full close produces correct trades", () => {
    let state = createInitialState("100000");
    state = executeMarketFill(state, {
      symbol: "ETHUSDT",
      side: "buy",
      qty: "2",
      marketPrice: "2000",
      slippage: "0",
    }).state;
    state = executeMarketFill(state, {
      symbol: "ETHUSDT",
      side: "buy",
      qty: "2",
      marketPrice: "3000",
      slippage: "0",
    }).state;
    assert.equal(d(state.holdings.ETH.avgEntry).toNumber(), 2500);
    const partial = executeMarketFill(state, {
      symbol: "ETHUSDT",
      side: "sell",
      qty: "1",
      marketPrice: "2800",
      slippage: "0",
    });
    state = partial.state;
    assert.equal(state.holdings.ETH.qty, "3");
    assert.ok(partial.trade);
    const full = executeMarketFill(state, {
      symbol: "ETHUSDT",
      side: "sell",
      qty: "3",
      marketPrice: "2600",
      slippage: "0",
    });
    assert.equal(full.state.holdings.ETH, undefined);
    assert.equal(full.state.trades.length, 2);
  });

  it("rejects sell more than holdings without mutating", () => {
    let state = createInitialState("100000");
    state = executeMarketFill(state, {
      symbol: "BTCUSDT",
      side: "buy",
      qty: "0.25",
      marketPrice: "40000",
      slippage: "0",
    }).state;
    const before = state.holdings.BTC.qty;
    const cash = state.account.cash;
    assert.throws(
      () =>
        executeMarketFill(state, {
          symbol: "BTCUSDT",
          side: "sell",
          qty: "0.5",
          marketPrice: "40000",
          slippage: "0",
        }),
      (err: unknown) => {
        assert.ok(err instanceof InsufficientHoldingsError);
        assert.match(err.message, /Insufficient BTC \(you hold 0\.25\)/);
        return true;
      },
    );
    assert.equal(state.holdings.BTC.qty, before);
    assert.equal(state.account.cash, cash);
  });

  it("rejects buy with insufficient cash", () => {
    const state = createInitialState("100");
    assert.throws(
      () =>
        executeMarketFill(state, {
          symbol: "BTCUSDT",
          side: "buy",
          qty: "1",
          marketPrice: "50000",
          slippage: "0",
        }),
      (err: unknown) => err instanceof InsufficientCashError,
    );
  });

  it("getValuation matches hand-computed mixed holdings", () => {
    let state = createInitialState("100000");
    state = executeMarketFill(state, {
      symbol: "BTCUSDT",
      side: "buy",
      qty: "0.1",
      marketPrice: "50000",
      slippage: "0",
    }).state;
    state = executeMarketFill(state, {
      symbol: "ETHUSDT",
      side: "buy",
      qty: "2",
      marketPrice: "3000",
      slippage: "0",
    }).state;
    const val = getValuation(state.holdings, { BTC: "51000", ETH: "3100" });
    // 0.1*51000 + 2*3100 = 5100 + 6200 = 11300
    assert.equal(val.toNumber(), 11300);
    const equity = getEquity(state, { BTC: "51000", ETH: "3100" });
    const cash = d(state.account.cash);
    assert.equal(equity.toString(), cash.plus(11300).toString());
    const u = getUnrealized(state.holdings.BTC, "51000");
    assert.equal(u.toNumber(), 100);
  });

  it("rounds qty down to stepSize and price to tickSize", () => {
    const state = createInitialState("100000");
    const result = executeMarketFill(state, {
      symbol: "BTCUSDT",
      side: "buy",
      qty: "0.123456",
      marketPrice: "50000.123",
      slippage: "0",
      stepSize: "0.001",
      tickSize: "0.1",
    });
    assert.equal(result.order.qty, "0.123");
    assert.equal(d(result.order.avgFillPrice!).toString(), "50000.1");
    const notional = d("0.123").mul(d("50000.1"));
    const fee = notional.mul("0.001");
    assert.equal(d(result.order.fee!).toString(), fee.toString());
  });

  it("avoids float drift across many fee operations", () => {
    let state = createInitialState("100000");
    for (let i = 0; i < 50; i++) {
      state = executeMarketFill(state, {
        symbol: "ETHUSDT",
        side: "buy",
        qty: "0.01",
        marketPrice: "3000.11",
        slippage: "0",
      }).state;
    }
    assert.equal(Number.isFinite(Number(state.account.cash)), true);
    assert.ok(state.holdings.ETH);
  });
});

describe("ledger limit orders", () => {
  it("reserves cash on buy limit and refunds on cancel", () => {
    let state = createInitialState("10000");
    const placed = placeLimitOrder(state, {
      symbol: "BTCUSDT",
      side: "buy",
      qty: "0.1",
      limitPrice: "40000",
    });
    state = placed.state;
    // notional 4000 + fee 4 = 4004 reserved
    assert.equal(d(state.account.reservedCash).toNumber(), 4004);
    assert.equal(d(state.account.cash).toNumber(), 10000);
    state = cancelOrder(state, placed.order.id);
    assert.equal(d(state.account.reservedCash).toNumber(), 0);
    assert.equal(state.orders[0].status, "cancelled");
  });

  it("fills buy limit at limit-or-better and writes holdings", () => {
    const state = createInitialState("10000");
    const placed = placeLimitOrder(state, {
      symbol: "BTCUSDT",
      side: "buy",
      qty: "0.1",
      limitPrice: "40000",
    });
    const fill = executeLimitFill(placed.state, placed.order.id, "39900");
    assert.ok(fill);
    assert.equal(fill!.order.status, "filled");
    assert.equal(d(fill!.order.avgFillPrice!).toNumber(), 39900);
    assert.equal(fill!.state.holdings.BTC.qty, "0.1");
    assert.equal(d(fill!.state.account.reservedCash).toNumber(), 0);
  });

  it("does not fill buy when price is above limit", () => {
    const placed = placeLimitOrder(createInitialState("10000"), {
      symbol: "BTCUSDT",
      side: "buy",
      qty: "0.1",
      limitPrice: "40000",
    });
    const fill = executeLimitFill(placed.state, placed.order.id, "41000");
    assert.equal(fill, null);
  });

  it("sell limit rejects over-holdings and fill writes a trade", () => {
    let state = createInitialState("100000");
    state = executeMarketFill(state, {
      symbol: "BTCUSDT",
      side: "buy",
      qty: "0.5",
      marketPrice: "40000",
      slippage: "0",
    }).state;
    assert.throws(
      () =>
        placeLimitOrder(state, {
          symbol: "BTCUSDT",
          side: "sell",
          qty: "1",
          limitPrice: "45000",
        }),
      (err: unknown) => err instanceof InsufficientHoldingsError,
    );
    const placed = placeLimitOrder(state, {
      symbol: "BTCUSDT",
      side: "sell",
      qty: "0.5",
      limitPrice: "45000",
    });
    const miss = executeLimitFill(placed.state, placed.order.id, "44000");
    assert.equal(miss, null);
    const fill = executeLimitFill(placed.state, placed.order.id, "45100");
    assert.ok(fill?.trade);
    assert.equal(fill!.state.holdings.BTC, undefined);
    assert.equal(d(fill!.order.avgFillPrice!).toNumber(), 45100);
  });

  it("limit fill is idempotent once filled", () => {
    const placed = placeLimitOrder(createInitialState("10000"), {
      symbol: "BTCUSDT",
      side: "buy",
      qty: "0.1",
      limitPrice: "40000",
    });
    const first = executeLimitFill(placed.state, placed.order.id, "40000");
    assert.ok(first);
    const second = executeLimitFill(first!.state, placed.order.id, "40000");
    assert.equal(second, null);
  });
});

describe("OCO stop-loss / take-profit", () => {
  it("buy limit with OCO creates sibling orders", () => {
    const placed = placeLimitOrder(createInitialState("10000"), {
      symbol: "BTCUSDT",
      side: "buy",
      qty: "0.1",
      limitPrice: "40000",
      ocoStopPrice: "38000",
      ocoTakeProfitPrice: "45000",
    });
    const ocoOrders = placed.state.orders.filter(
      (o) => o.ocoGroupId && o.ocoGroupId === placed.state.orders.find(
        (x) => x.limitPrice === "38000",
      )?.ocoGroupId,
    );
    assert.equal(ocoOrders.length, 2);
    assert.ok(!placed.order.ocoGroupId);
    const stop = ocoOrders.find((o) => o.limitPrice === "38000");
    const tp = ocoOrders.find((o) => o.limitPrice === "45000");
    assert.ok(stop);
    assert.ok(tp);
    assert.equal(stop!.side, "sell");
    assert.equal(tp!.side, "sell");
  });

  it("filling the buy does not cancel OCO siblings", () => {
    let state = createInitialState("10000");
    const placed = placeLimitOrder(state, {
      symbol: "BTCUSDT",
      side: "buy",
      qty: "0.1",
      limitPrice: "40000",
      ocoStopPrice: "38000",
      ocoTakeProfitPrice: "45000",
    });
    state = placed.state;
    const ocoId = placed.state.orders.find((o) => o.limitPrice === "38000")?.ocoGroupId;
    assert.ok(ocoId);
    const fill = executeLimitFill(state, placed.order.id, "39000");
    assert.ok(fill);
    state = fill.state;
    const siblings = state.orders.filter(
      (o) => o.ocoGroupId === ocoId,
    );
    assert.ok(siblings.every((o) => o.status === "open"));
  });

  it("filling the stop-loss cancels the take-profit sibling", () => {
    let state = createInitialState("10000");
    const placed = placeLimitOrder(state, {
      symbol: "BTCUSDT",
      side: "buy",
      qty: "0.1",
      limitPrice: "40000",
      ocoStopPrice: "38000",
      ocoTakeProfitPrice: "45000",
    });
    state = placed.state;
    const ocoId = state.orders.find((o) => o.limitPrice === "38000")?.ocoGroupId;
    assert.ok(ocoId);

    const buyFill = executeLimitFill(state, placed.order.id, "39000");
    assert.ok(buyFill);
    state = buyFill.state;

    const stopOrder = state.orders.find(
      (o) => o.ocoGroupId === ocoId && o.limitPrice === "38000",
    );
    assert.ok(stopOrder);
    const tpOrder = state.orders.find(
      (o) => o.ocoGroupId === ocoId && o.limitPrice === "45000",
    );
    assert.ok(tpOrder);

    const stopFill = executeLimitFill(state, stopOrder!.id, "41000");
    assert.ok(stopFill);
    state = stopFill.state;

    const tpAfter = state.orders.find((o) => o.id === tpOrder!.id);
    assert.ok(tpAfter);
    assert.equal(tpAfter!.status, "cancelled");
  });
});
