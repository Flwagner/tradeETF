import type { PricePoint, TrailingStopCandidate, TrailingStopResult } from '../types';
import { metricClose, sortPrices } from './momentum';

const STOP_CANDIDATES = [5, 7, 10, 12, 15];

interface SimulatedTrade {
  returnPercent: number;
  stopped: boolean;
}

export function computeTrailingStop(prices: PricePoint[]): TrailingStopResult {
  const sorted = sortPrices(prices);
  if (sorted.length < 62) {
    return {
      available: false,
      message: 'historique insuffisant',
      candidates: [],
    };
  }

  const lookback = sorted.slice(-252);
  const latestClose = metricClose(lookback[lookback.length - 1]);
  const candidates = STOP_CANDIDATES.map((percentage) => buildCandidate(lookback, latestClose, percentage));
  const eligible = candidates.filter((candidate) => candidate.stopHitRate <= 45);
  const pool = eligible.length > 0 ? eligible : candidates;
  const recommended = [...pool].sort((a, b) => b.riskAdjustedScore - a.riskAdjustedScore)[0];

  return {
    available: true,
    latestClose,
    recommended,
    candidates,
  };
}

function buildCandidate(prices: PricePoint[], latestClose: number, percentage: number): TrailingStopCandidate {
  const trades: SimulatedTrade[] = [];

  for (let entryIndex = 0; entryIndex < prices.length - 1; entryIndex += 5) {
    trades.push(simulateTrade(prices, entryIndex, percentage));
  }

  const returns = trades.map((trade) => trade.returnPercent);
  const averageReturn = average(returns);
  const worstReturn = Math.min(...returns);
  const bestReturn = Math.max(...returns);
  const winRate = percentageOf(trades.filter((trade) => trade.returnPercent > 0).length, trades.length);
  const stopHitRate = percentageOf(trades.filter((trade) => trade.stopped).length, trades.length);
  const turnoverPenalty = stopHitRate * 0.12;
  const excessTurnoverPenalty = Math.max(0, stopHitRate - 45) * 0.3;
  const lossPenalty = Math.abs(Math.min(0, worstReturn)) * 0.75;

  return {
    percentage,
    stopPrice: latestClose * (1 - percentage / 100),
    trades: trades.length,
    averageReturn,
    worstReturn,
    bestReturn,
    winRate,
    stopHitRate,
    riskAdjustedScore: averageReturn - lossPenalty - turnoverPenalty - excessTurnoverPenalty,
  };
}

function simulateTrade(prices: PricePoint[], entryIndex: number, percentage: number): SimulatedTrade {
  const entry = prices[entryIndex];
  const entryPrice = metricClose(entry);
  let highestWeeklyClose = entryPrice;
  let stopPrice = entryPrice * (1 - percentage / 100);
  const maxExitIndex = Math.min(prices.length - 1, entryIndex + 60);

  for (let index = entryIndex + 1; index <= maxExitIndex; index += 1) {
    const price = prices[index];
    const close = metricClose(price);
    const low = price.lowPrice;
    const touched = low !== null && low !== undefined ? low <= stopPrice : close <= stopPrice;

    if (touched) {
      const exitPrice = low !== null && low !== undefined ? stopPrice : close;
      return {
        returnPercent: (exitPrice / entryPrice - 1) * 100,
        stopped: true,
      };
    }

    if ((index - entryIndex) % 5 === 0) {
      highestWeeklyClose = Math.max(highestWeeklyClose, close);
      stopPrice = Math.max(stopPrice, highestWeeklyClose * (1 - percentage / 100));
    }
  }

  const exitPrice = metricClose(prices[maxExitIndex]);
  return {
    returnPercent: (exitPrice / entryPrice - 1) * 100,
    stopped: false,
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentageOf(count: number, total: number): number {
  if (total === 0) return 0;
  return (count / total) * 100;
}
