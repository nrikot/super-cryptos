import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeAnalytics } from "./pnl.ts";
import type { Trade } from "../ledger/types.ts";

function trade(net: string, fees = "1"): Trade {
  return {
    id: net,
    symbol: "BTCUSDT",
    openedAt: 1,
    closedAt: 2,
    qty: "1",
    avgEntry: "100",
    avgExit: "110",
    grossPnl: net,
    fees,
    netPnl: net,
  };
}

describe("analytics from trades table", () => {
  it("computes win rate, profit factor, best/worst from closed lots only", () => {
    const a = computeAnalytics(
      [trade("100"), trade("-40"), trade("20")],
      {},
      {},
    );
    assert.equal(a.tradeCount, 3);
    assert.equal(a.wins, 2);
    assert.equal(a.losses, 1);
    assert.equal(a.winRate, "66.67");
    assert.equal(a.realized, "80");
    assert.equal(a.bestTrade?.netPnl, "100");
    assert.equal(a.worstTrade?.netPnl, "-40");
    assert.equal(a.profitFactor, "3.00");
  });
});
