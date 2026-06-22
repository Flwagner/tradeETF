import { describe, expect, it } from 'vitest';
import { computeTrailingStop } from './trailingStop';
import { makePrices } from '../test/factories';

describe('trailing stop', () => {
  it('is unavailable with insufficient history', () => {
    const result = computeTrailingStop(makePrices('etf', 30));
    expect(result.available).toBe(false);
    expect(result.message).toBe('historique insuffisant');
  });

  it('recommends one of the configured stop candidates', () => {
    const result = computeTrailingStop(makePrices('etf', 180));
    expect(result.available).toBe(true);
    expect([5, 7, 10, 12, 15]).toContain(result.recommended?.percentage);
  });
});
