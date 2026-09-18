import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectKlineCrossing, tickCrossesLimit } from "./crossing.ts";
import type { Order } from "../ledger/types.ts";

function order(partial: Partial<Order>): Order {
  return {
    id: "o1",
    symbol: "BTCUSDT",
    side: "buy",
    type: "limit",
    qty: "1",
    limitPrice: "100",
    status: "open",
    createdAt: 0,
    cursor: 0,
    ...partial,
  };
}

describe("tick crossing", () => {
  it("buy fills at price ≤ limit", () => {
    assert.equal(tickCrossesLimit("buy", "100", "100"), true);
    assert.equal(tickCrossesLimit("buy", "100", "99.99"), true);
    assert.equal(tickCrossesLimit("buy", "100", "100.01"), false);
  });

  it("sell fills at price ≥ limit", () => {
    assert.equal(tickCrossesLimit("sell", "100", "100"), true);
    assert.equal(tickCrossesLimit("sell", "100", "100.01"), true);
    assert.equal(tickCrossesLimit("sell", "100", "99.99"), false);
  });
});

describe("kline crossing detection", () => {
  it("exact touch fills a buy when low == limit", () => {
    const hit = detectKlineCrossing(order({ side: "buy", limitPrice: "100" }), [
      { time: 60, open: 101, high: 102, low: 100, close: 101 },
    ]);
    assert.equal(hit.filled, true);
    assert.equal(hit.cursor, 60);
  });

  it("exact touch fills a sell when high == limit", () => {
    const hit = detectKlineCrossing(order({ side: "sell", limitPrice: "100" }), [
      { time: 60, open: 99, high: 100, low: 98, close: 99 },
    ]);
    assert.equal(hit.filled, true);
  });

  it("gap-through fills when candle opens beyond the limit", () => {
    const buy = detectKlineCrossing(order({ side: "buy", limitPrice: "100" }), [
      { time: 60, open: 90, high: 95, low: 88, close: 92 },
    ]);
    assert.equal(buy.filled, true);
    const sell = detectKlineCrossing(order({ side: "sell", limitPrice: "100" }), [
      { time: 60, open: 110, high: 112, low: 108, close: 111 },
    ]);
    assert.equal(sell.filled, true);
  });

  it("multiple crossings in one window produce a single fill", () => {
    const hit = detectKlineCrossing(order({ side: "buy", limitPrice: "100" }), [
      { time: 60, open: 101, high: 102, low: 99, close: 100 },
      { time: 120, open: 100, high: 101, low: 90, close: 95 },
      { time: 180, open: 95, high: 96, low: 80, close: 90 },
    ]);
    assert.equal(hit.filled, true);
    assert.equal(hit.cursor, 60);
    assert.equal(hit.fillTime, 60000);
  });

  it("backfill replay fills exactly once via cursor + filled status", () => {
    const klines = [
      { time: 60, open: 101, high: 102, low: 99, close: 100 },
      { time: 120, open: 100, high: 101, low: 90, close: 95 },
    ];
    const first = detectKlineCrossing(order({ cursor: 0 }), klines);
    assert.equal(first.filled, true);
    const afterFill = detectKlineCrossing(
      order({ cursor: first.cursor, status: "filled" }),
      klines,
    );
    assert.equal(afterFill.filled, false);
    const alreadyEvaluated = detectKlineCrossing(
      order({ cursor: 120 }),
      klines,
    );
    assert.equal(alreadyEvaluated.filled, false);
  });

  it("does not fill when the range never touches the limit", () => {
    const hit = detectKlineCrossing(order({ side: "buy", limitPrice: "100" }), [
      { time: 60, open: 110, high: 112, low: 108, close: 111 },
    ]);
    assert.equal(hit.filled, false);
    assert.equal(hit.cursor, 60);
  });
});
