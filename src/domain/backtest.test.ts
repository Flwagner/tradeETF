import { describe, expect, it } from 'vitest';
import { runTacticalBacktest } from './backtest';
import { makeEtf, makePrices } from '../test/factories';

describe('tactical backtest', () => {
  it('produces an equity curve', () => {
    const result = runTacticalBacktest([
      { etf: makeEtf('1', 'AAA'), prices: makePrices('1', 260, { dailyReturn: 0.001 }) },
    ]);
    expect(result.equityCurve.length).toBeGreaterThan(0);
  });

  it('respects the stop loss', () => {
    const result = runTacticalBacktest(
      [{ etf: makeEtf('1', 'AAA'), prices: makePrices('1', 260, { dailyReturn: 0.002, shockAt: 230, shockMultiplier: 0.6 }) }],
      { stopLossPercent: 10 },
    );
    expect(result.trades.length).toBeGreaterThan(0);
    expect(result.trades.some((trade) => trade.exitPrice <= trade.stopPrice * 1.0001)).toBe(true);
  });

  it('opens a position on the best score', () => {
    const result = runTacticalBacktest(
      [
        { etf: makeEtf('1', 'SLOW'), prices: makePrices('1', 260, { dailyReturn: 0.0002 }) },
        { etf: makeEtf('2', 'FAST'), prices: makePrices('2', 260, { dailyReturn: 0.002 }) },
      ],
      { stopLossPercent: 10 },
    );
    expect(result.openPosition?.symbol ?? result.trades[0]?.symbol).toBe('FAST');
  });
});
