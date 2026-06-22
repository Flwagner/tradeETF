import type { ETF, PricePoint } from '../types';

export function makeEtf(id: string, symbol: string): ETF {
  return {
    id,
    isin: `FR${id.padStart(10, '0')}`,
    symbol,
    name: `${symbol} ETF`,
    exchange: 'XPAR',
    currency: 'EUR',
    peaEligible: true,
    active: true,
    boursoIdentifier: null,
    dataProviderSymbol: `${symbol}.PA`,
  };
}

export function makePrices(
  etfId: string,
  count: number,
  options: {
    start?: number;
    dailyReturn?: number;
    startDate?: string;
    adjustedMultiplier?: number;
    shockAt?: number;
    shockMultiplier?: number;
  } = {},
): PricePoint[] {
  const start = options.start ?? 100;
  const dailyReturn = options.dailyReturn ?? 0.001;
  const startDate = new Date(`${options.startDate ?? '2024-01-01'}T00:00:00`);
  const prices: PricePoint[] = [];
  let close = start;
  let calendarOffset = 0;

  while (prices.length < count) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + calendarOffset);
    calendarOffset += 1;
    if (date.getDay() === 0 || date.getDay() === 6) continue;

    if (options.shockAt === prices.length) close *= options.shockMultiplier ?? 0.8;
    close *= 1 + dailyReturn;
    const adjustedClose = options.adjustedMultiplier ? close * options.adjustedMultiplier : close;
    prices.push({
      etfId,
      pricedAt: date.toISOString().slice(0, 10),
      openPrice: close * 0.997,
      highPrice: close * 1.01,
      lowPrice: close * 0.99,
      closePrice: close,
      adjustedClosePrice: adjustedClose,
      volume: 1000 + prices.length,
      source: 'test',
    });
  }

  return prices;
}
