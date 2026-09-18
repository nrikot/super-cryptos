import { d, Decimal } from "../ledger/math.ts";
import { getUnrealized } from "../ledger/ledger.ts";
import type { Holding, Trade } from "../ledger/types.ts";

export interface Analytics {
  realized: string;
  unrealized: string;
  totalFees: string;
  winRate: string;
  wins: number;
  losses: number;
  avgWin: string;
  avgLoss: string;
  profitFactor: string;
  bestTrade: Trade | null;
  worstTrade: Trade | null;
  tradeCount: number;
}

export function computeAnalytics(
  trades: Trade[],
  holdings: Record<string, Holding>,
  prices: Record<string, string>,
): Analytics {
  let realized = d(0);
  let totalFees = d(0);
  let winSum = d(0);
  let lossSum = d(0);
  let wins = 0;
  let losses = 0;
  let best: Trade | null = null;
  let worst: Trade | null = null;

  for (const t of trades) {
    const net = d(t.netPnl);
    realized = realized.plus(net);
    totalFees = totalFees.plus(d(t.fees));
    if (net.gt(0)) {
      wins += 1;
      winSum = winSum.plus(net);
    } else if (net.lt(0)) {
      losses += 1;
      lossSum = lossSum.plus(net);
    }
    if (!best || net.gt(d(best.netPnl))) best = t;
    if (!worst || net.lt(d(worst.netPnl))) worst = t;
  }

  let unrealized = d(0);
  for (const h of Object.values(holdings)) {
    const mark = prices[h.asset];
    if (!mark) continue;
    unrealized = unrealized.plus(getUnrealized(h, mark));
  }

  const decided = wins + losses;
  const winRate = decided === 0 ? d(0) : d(wins).div(decided).mul(100);
  const avgWin = wins === 0 ? d(0) : winSum.div(wins);
  const avgLoss = losses === 0 ? d(0) : lossSum.div(losses);
  const absLoss = lossSum.abs();
  const profitFactor =
    absLoss.isZero() ? (winSum.gt(0) ? d(999) : d(0)) : winSum.div(absLoss);

  return {
    realized: realized.toString(),
    unrealized: unrealized.toString(),
    totalFees: totalFees.toString(),
    winRate: winRate.toFixed(2),
    wins,
    losses,
    avgWin: avgWin.toString(),
    avgLoss: avgLoss.toString(),
    profitFactor: profitFactor.toFixed(2),
    bestTrade: best,
    worstTrade: worst,
    tradeCount: trades.length,
  };
}

export function change24h(
  snapshots: Array<{ ts: number; equity: string }>,
  nowEquity: string,
  now = Date.now(),
): { amount: Decimal; pct: Decimal } {
  const cutoff = now - 24 * 60 * 60 * 1000;
  let baseline: string | null = null;
  for (const s of snapshots) {
    if (s.ts <= cutoff) baseline = s.equity;
    else break;
  }
  if (baseline == null) {
    baseline = snapshots[0]?.equity ?? nowEquity;
  }
  const amount = d(nowEquity).minus(d(baseline));
  const pct = d(baseline).isZero() ? d(0) : amount.div(d(baseline)).mul(100);
  return { amount, pct };
}
