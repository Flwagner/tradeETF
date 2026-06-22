import { describe, expect, it } from 'vitest';
import { parseEtfTextarea, parseYahooChartResponse } from './importers';

describe('parseEtfTextarea', () => {
  it('keeps an explicit data provider symbol for ISIN inputs', () => {
    const [etf] = parseEtfTextarea('IE000I8KRLL9,ETF exemple,XPAR,EUR,WEBN.PA');

    expect(etf.isin).toBe('IE000I8KRLL9');
    expect(etf.symbol).toBe('IE000I8KRLL9');
    expect(etf.dataProviderSymbol).toBe('WEBN.PA');
  });
});

describe('parseYahooChartResponse', () => {
  it('converts Yahoo chart data into price points', () => {
    const prices = parseYahooChartResponse(
      {
        chart: {
          result: [
            {
              timestamp: [1_719_007_200],
              indicators: {
                quote: [
                  {
                    open: [100],
                    high: [103],
                    low: [99],
                    close: [102],
                    volume: [1234],
                  },
                ],
                adjclose: [{ adjclose: [101.5] }],
              },
            },
          ],
        },
      },
      'etf-1',
    );

    expect(prices).toEqual([
      {
        etfId: 'etf-1',
        pricedAt: '2024-06-21',
        openPrice: 100,
        highPrice: 103,
        lowPrice: 99,
        closePrice: 102,
        adjustedClosePrice: 101.5,
        volume: 1234,
        source: 'yahoo',
      },
    ]);
  });
});
