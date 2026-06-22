import type { BacktestResult, BacktestSettings, ETF, OpenPosition, PricePoint } from '../types';
import { computeMomentumV1, metricClose, sortPrices } from './momentum';

interface BacktestDataset {
  etf: ETF;
  prices: PricePoint[];
}

interface InternalPosition extends OpenPosition {
  lastPrice: number;
}

const PERIOD_MONTHS: Record<BacktestSettings['period'], number> = {
  '1y': 12,
  '6m': 6,
  '3m': 3,
};

export function runTacticalBacktest(
  datasets: BacktestDataset[],
  settings: Partial<BacktestSettings> = {},
): BacktestResult {
  const resolved: BacktestSettings = {
    period: settings.period ?? '1y',
    stopLossPercent: clamp(settings.stopLossPercent ?? 10, 1, 25),
    initialCapital: settings.initialCapital ?? 1000,
  };
  const normalized = datasets
    .map((dataset) => ({ ...dataset, prices: sortPrices(dataset.prices) }))
    .filter((dataset) => dataset.prices.length >= 2);
  const allDates = buildDates(normalized, resolved.period);
  let cash = resolved.initialCapital;
  let position: InternalPosition | null = null;
  const trades: BacktestResult['trades'] = [];
  const equityCurve: BacktestResult['equityCurve'] = [];

  for (const date of allDates) {
    if (position) {
      const point = priceAtOrBefore(normalized.find((item) => item.etf.id === position?.etfId)?.prices ?? [], date);
      if (point) {
        const close = metricClose(point);
        position.currentValue = position.quantity * close;
        position.lastPrice = close;
        const low = point.lowPrice;
        const stopTouched = low !== null && low !== undefined ? low <= position.stopPrice : close <= position.stopPrice;

        if (stopTouched) {
          const exitPrice = low !== null && low !== undefined ? position.stopPrice : close;
          cash = position.quantity * exitPrice;
          trades.push({
            etfId: position.etfId,
            symbol: position.symbol,
            entryDate: position.entryDate,
            exitDate: date,
            entryPrice: position.entryPrice,
            exitPrice,
            stopPrice: position.stopPrice,
            entryScore: position.entryScore,
            returnPercent: exitPrice / position.entryPrice - 1,
            capitalAfterExit: cash,
          });
          position = null;
        }
      }
    }

    if (!position && cash > 0) {
      const selection = selectBestMomentum(normalized, date);
      if (selection) {
        const point = priceAtOrBefore(selection.dataset.prices, date);
        if (point) {
          const entryPrice = metricClose(point);
          position = {
            etfId: selection.dataset.etf.id,
            symbol: selection.dataset.etf.symbol,
            entryDate: date,
            entryPrice,
            quantity: cash / entryPrice,
            stopPrice: entryPrice * (1 - resolved.stopLossPercent / 100),
            entryScore: selection.score,
            currentValue: cash,
            lastPrice: entryPrice,
          };
          cash = 0;
        }
      }
    }

    const value = position ? position.currentValue : cash;
    equityCurve.push({ date, value });
  }

  const finalValue = equityCurve[equityCurve.length - 1]?.value ?? resolved.initialCapital;
  const closedReturns = trades.map((trade) => trade.returnPercent);
  const wins = closedReturns.filter((value) => value > 0).length;

  return {
    settings: resolved,
    summary: {
      finalValue,
      returnPercent: finalValue / resolved.initialCapital - 1,
      tradeCount: trades.length,
      winRate: trades.length === 0 ? 0 : wins / trades.length,
      averageTradeReturn: closedReturns.length === 0 ? 0 : closedReturns.reduce((sum, value) => sum + value, 0) / closedReturns.length,
      maxDrawdown: maxDrawdown(equityCurve),
    },
    trades,
    openPosition: position
      ? {
          etfId: position.etfId,
          symbol: position.symbol,
          entryDate: position.entryDate,
          entryPrice: position.entryPrice,
          quantity: position.quantity,
          stopPrice: position.stopPrice,
          entryScore: position.entryScore,
          currentValue: position.currentValue,
        }
      : null,
    equityCurve,
  };
}

function selectBestMomentum(datasets: BacktestDataset[], date: string) {
  const selections = datasets.flatMap((dataset) => {
    const prices = dataset.prices.filter((price) => price.pricedAt <= date);
    if (prices.length < 2) return [];
    try {
      const snapshot = computeMomentumV1(dataset.etf.id, prices, date);
      if (!snapshot.details.enough_history) return [];
      return [{ dataset, score: snapshot.score, snapshot }];
    } catch {
      return [];
    }
  });

  return selections.sort((a, b) => b.score - a.score)[0] ?? null;
}

function buildDates(datasets: BacktestDataset[], period: BacktestSettings['period']): string[] {
  const sortedDates = datasets
    .flatMap((dataset) => dataset.prices.map((price) => price.pricedAt))
    .sort();
  const latestDate = sortedDates[sortedDates.length - 1];
  if (!latestDate) return [];
  const start = addMonths(latestDate, -PERIOD_MONTHS[period]);
  return [...new Set(datasets.flatMap((dataset) => dataset.prices.map((price) => price.pricedAt)))]
    .filter((date) => date >= start && date <= latestDate)
    .sort();
}

function priceAtOrBefore(prices: PricePoint[], date: string): PricePoint | null {
  for (let index = prices.length - 1; index >= 0; index -= 1) {
    if (prices[index].pricedAt <= date) return prices[index];
  }
  return null;
}

function addMonths(date: string, months: number): string {
  const value = new Date(`${date}T00:00:00`);
  value.setMonth(value.getMonth() + months);
  return value.toISOString().slice(0, 10);
}

function maxDrawdown(curve: BacktestResult['equityCurve']): number {
  if (curve.length < 2) return 0;
  let peak = curve[0].value;
  let drawdown = 0;
  for (const point of curve) {
    peak = Math.max(peak, point.value);
    drawdown = Math.min(drawdown, point.value / peak - 1);
  }
  return drawdown;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
