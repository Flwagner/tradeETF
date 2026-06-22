import type { MomentumSnapshot, PricePoint } from '../types';

export const MOMENTUM_STRATEGY_CODE = 'momentum_v1' as const;

const WEIGHTS = {
  momentum1M: 0.15,
  momentum3M: 0.25,
  momentum6M: 0.25,
  momentum12M: 0.1,
  trend: 0.15,
  risk: 0.1,
};

export function metricClose(price: PricePoint): number {
  return price.adjustedClosePrice && price.adjustedClosePrice > 0
    ? price.adjustedClosePrice
    : price.closePrice;
}

export function sortPrices(prices: PricePoint[]): PricePoint[] {
  return [...prices].sort((a, b) => a.pricedAt.localeCompare(b.pricedAt));
}

export function computeMomentumV1(etfId: string, prices: PricePoint[], computedAt?: string): MomentumSnapshot {
  if (prices.length < 2) {
    throw new Error('momentum_v1 requires at least 2 price points');
  }

  const sorted = sortPrices(prices);
  const latest = sorted[sorted.length - 1];
  const latestMetricClose = metricClose(latest);
  const latestDate = computedAt ?? latest.pricedAt;

  const performance1Month = performanceSince(sorted, latest.pricedAt, 1);
  const performance3Months = performanceSince(sorted, latest.pricedAt, 3);
  const performance6Months = performanceSince(sorted, latest.pricedAt, 6);
  const performance12Months = performanceSince(sorted, latest.pricedAt, 12);
  const movingAverage50 = movingAverage(sorted, 50);
  const movingAverage200 = movingAverage(sorted, 200);
  const distanceToMovingAverage200 = movingAverage200 === null ? null : latestMetricClose / movingAverage200 - 1;
  const volatilityAnnualized = annualizedVolatility(sorted);
  const maxDrawdown = computeMaxDrawdown(sorted);
  const atr14 = computeAtr14(sorted);

  const momentum1M = momentumComponent(performance1Month);
  const momentum3M = momentumComponent(performance3Months);
  const momentum6M = momentumComponent(performance6Months);
  const momentum12M = momentumComponent(performance12Months);
  const trend = trendComponent(latestMetricClose, movingAverage50, movingAverage200);
  const risk = riskComponent(volatilityAnnualized, maxDrawdown, atr14, latestMetricClose, distanceToMovingAverage200);

  const score =
    WEIGHTS.momentum1M * momentum1M +
    WEIGHTS.momentum3M * momentum3M +
    WEIGHTS.momentum6M * momentum6M +
    WEIGHTS.momentum12M * momentum12M +
    WEIGHTS.trend * trend +
    WEIGHTS.risk * risk;

  const enoughHistory = sorted.length >= 126 && performance3Months !== null && performance6Months !== null;
  const signal = deriveSignal(enoughHistory, movingAverage200, latestMetricClose, score);

  return {
    etfId,
    computedAt: latestDate,
    strategyCode: MOMENTUM_STRATEGY_CODE,
    score,
    performance1Month,
    performance3Months,
    performance6Months,
    performance12Months,
    volatilityAnnualized,
    maxDrawdown,
    movingAverage50,
    movingAverage200,
    distanceToMovingAverage200,
    atr14,
    signal,
    details: {
      latest_close: latest.closePrice,
      latest_metric_close: latestMetricClose,
      latest_priced_at: latest.pricedAt,
      price_basis: 'adjusted_close_when_available',
      price_points: sorted.length,
      enough_history: enoughHistory,
      score_profile: 'hybrid_momentum_3_to_6_months',
      weights: WEIGHTS,
      components: {
        momentum_1_month: momentum1M,
        momentum_3_months: momentum3M,
        momentum_6_months: momentum6M,
        momentum_12_months: momentum12M,
        trend,
        risk,
      },
    },
  };
}

function deriveSignal(
  enoughHistory: boolean,
  movingAverage200: number | null,
  latestClose: number,
  score: number,
): 'buy' | 'watch' | 'avoid' {
  if (!enoughHistory) return 'watch';
  if (movingAverage200 !== null && latestClose < movingAverage200) return 'watch';
  if (score >= 65) return 'buy';
  if (score < 45) return 'avoid';
  return 'watch';
}

function performanceSince(prices: PricePoint[], latestDate: string, months: number): number | null {
  const targetDate = addMonths(latestDate, -months);
  const reference = findAtOrBefore(prices, targetDate);
  if (!reference) return null;
  return metricClose(prices[prices.length - 1]) / metricClose(reference) - 1;
}

function findAtOrBefore(prices: PricePoint[], date: string): PricePoint | null {
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

function movingAverage(prices: PricePoint[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((sum, price) => sum + metricClose(price), 0) / period;
}

function annualizedVolatility(prices: PricePoint[]): number | null {
  const slice = prices.slice(-253);
  if (slice.length < 2) return null;
  const returns = slice.slice(1).map((price, index) => Math.log(metricClose(price) / metricClose(slice[index])));
  if (returns.length < 2) return null;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

function computeMaxDrawdown(prices: PricePoint[]): number | null {
  const slice = prices.slice(-252);
  if (slice.length < 2) return null;
  let peak = metricClose(slice[0]);
  let maxDrawdown = 0;

  for (const price of slice) {
    const close = metricClose(price);
    peak = Math.max(peak, close);
    maxDrawdown = Math.min(maxDrawdown, close / peak - 1);
  }

  return maxDrawdown;
}

function computeAtr14(prices: PricePoint[]): number | null {
  if (prices.length < 15) return null;
  const slice = prices.slice(-15);
  const ranges = slice.slice(1).map((price, index) => {
    const previousClose = metricClose(slice[index]);
    const high = price.highPrice ?? metricClose(price);
    const low = price.lowPrice ?? metricClose(price);
    return Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
  });

  return ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
}

function momentumComponent(performance: number | null): number {
  if (performance === null) return 50;
  return clamp(50 + performance * 100, 0, 100);
}

function trendComponent(latestClose: number, movingAverage50: number | null, movingAverage200: number | null): number {
  if (movingAverage50 === null) return 50;
  if (movingAverage200 !== null && latestClose > movingAverage50 && movingAverage50 > movingAverage200) return 100;
  if (latestClose > movingAverage50 && (movingAverage200 === null || latestClose > movingAverage200)) return 80;
  if (latestClose > movingAverage50) return 70;
  return 25;
}

function riskComponent(
  volatilityAnnualized: number | null,
  maxDrawdown: number | null,
  atr14: number | null,
  latestClose: number,
  distanceToMovingAverage200: number | null,
): number {
  const volatilityScore = volatilityAnnualized === null ? 50 : clamp(100 - volatilityAnnualized * 120, 0, 100);
  const drawdownScore = maxDrawdown === null ? 50 : clamp(100 + maxDrawdown * 120, 0, 100);
  const atrScore = atr14 === null ? 50 : clamp(100 - (atr14 / latestClose) * 1000, 0, 100);
  const extensionScore = extensionComponent(distanceToMovingAverage200);

  return 0.35 * volatilityScore + 0.25 * drawdownScore + 0.25 * atrScore + 0.15 * extensionScore;
}

function extensionComponent(distance: number | null): number {
  if (distance === null) return 50;
  if (distance < -0.05) return 40;
  if (distance <= 0.25) return 100;
  return clamp(100 - (distance - 0.25) * 160, 30, 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
