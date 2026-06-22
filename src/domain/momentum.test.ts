import { describe, expect, it } from 'vitest';
import { computeMomentumV1 } from './momentum';
import { makePrices } from '../test/factories';

describe('momentum_v1', () => {
  it('throws with fewer than 2 prices', () => {
    expect(() => computeMomentumV1('etf', makePrices('etf', 1))).toThrow(/at least 2/);
  });

  it('uses adjusted close when available and positive', () => {
    const prices = makePrices('etf', 2, { adjustedMultiplier: 1.2 });
    const snapshot = computeMomentumV1('etf', prices);
    const latest = prices[prices.length - 1];
    expect(snapshot.details.latest_metric_close).toBeCloseTo(latest.adjustedClosePrice!);
  });

  it('returns watch when history is too short', () => {
    const snapshot = computeMomentumV1('etf', makePrices('etf', 80));
    expect(snapshot.signal).toBe('watch');
    expect(snapshot.details.enough_history).toBe(false);
  });

  it('returns buy with long rising history', () => {
    const snapshot = computeMomentumV1('etf', makePrices('etf', 280, { dailyReturn: 0.002 }));
    expect(snapshot.details.enough_history).toBe(true);
    expect(snapshot.score).toBeGreaterThanOrEqual(65);
    expect(snapshot.signal).toBe('buy');
  });
});
