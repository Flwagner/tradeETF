import { isSupabaseConfigured, requireSupabase } from '../lib/supabase';
import type { ETF, PricePoint } from '../types';

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
        adjclose?: Array<{
          adjclose?: Array<number | null>;
        }>;
      };
    }> | null;
    error?: {
      code?: string;
      description?: string;
    } | null;
  };
};
type YahooSearchResponse = {
  etf: Omit<ETF, 'id'> | null;
};
type YahooPricesResponse = {
  prices: PricePoint[];
  providerSymbol: string;
};
export type BoursobankTopEtf = {
  rank: number;
  name: string;
  isin: string;
  boursoIdentifier: string;
  url: string;
};
type BoursobankTopResponse = {
  etfs: BoursobankTopEtf[];
};

export class YahooFinanceError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'YahooFinanceError';
  }
}

export function parseEtfTextarea(input: string): Array<Omit<ETF, 'id'>> {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [isinOrSymbol, name = isinOrSymbol, exchange = 'XPAR', currency = 'EUR', dataProviderSymbol] = line
        .split(/[;,]/)
        .map((value) => value.trim());
      const looksLikeIsin = /^[A-Z]{2}[A-Z0-9]{10}$/.test(isinOrSymbol.toUpperCase());
      const symbol = looksLikeIsin ? isinOrSymbol.toUpperCase() : isinOrSymbol.toUpperCase();
      return {
        isin: looksLikeIsin ? isinOrSymbol.toUpperCase() : `MANUAL-${isinOrSymbol.toUpperCase()}`,
        symbol,
        name,
        exchange,
        currency,
        peaEligible: false,
        active: true,
        boursoIdentifier: null,
        dataProviderSymbol: dataProviderSymbol || (looksLikeIsin ? null : symbol),
      };
    });
}

export async function tryYahooDownload(symbol: string, etfId: string, since: string): Promise<PricePoint[]> {
  if (isSupabaseConfigured) {
    const { data, error } = await requireSupabase().functions.invoke<YahooPricesResponse>('yahoo-prices', {
      body: { symbol, etfId, since },
    });
    if (error) throw new Error(error.message);
    return data?.prices ?? [];
  }

  const period1 = Math.floor(new Date(`${since}T00:00:00`).getTime() / 1000);
  const period2 = Math.floor(Date.now() / 1000);
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?period1=${period1}&period2=${period2}&interval=1d&events=history`;

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new YahooFinanceError(await yahooHttpErrorMessage(response, symbol), response.status);
  }
  return parseYahooChartResponse((await response.json()) as YahooChartResponse, etfId, 'yahoo');
}

export async function searchYahooEtfByIsin(
  isin: string,
  fallbackCurrency = 'EUR',
): Promise<Omit<ETF, 'id'> | null> {
  const normalizedIsin = isin.trim().toUpperCase();
  if (!looksLikeIsin(normalizedIsin)) {
    throw new Error(`Code ISIN invalide: ${isin}`);
  }
  if (!isSupabaseConfigured) {
    throw new Error('Supabase est requis pour résoudre un ISIN via Yahoo sans CORS.');
  }

  const { data, error } = await requireSupabase().functions.invoke<YahooSearchResponse>('yahoo-search', {
    body: { isin: normalizedIsin, fallbackCurrency },
  });
  if (error) throw new Error(error.message);
  return data?.etf ?? null;
}

export async function tryBoursobankTopEtf(limit = 15): Promise<BoursobankTopEtf[]> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase est requis pour importer le top Boursobank sans CORS.');
  }

  const { data, error } = await requireSupabase().functions.invoke<BoursobankTopResponse>('boursobank-top', {
    body: { limit },
  });
  if (error) throw new Error(error.message);
  return data?.etfs ?? [];
}

export function parseYahooChartResponse(
  payload: YahooChartResponse,
  etfId: string,
  defaultSource = 'yahoo',
): PricePoint[] {
  const error = payload.chart?.error;
  if (error) {
    throw new Error(`Yahoo Finance: ${error.description ?? error.code ?? 'réponse invalide'}`);
  }

  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  const adjustedClose = result?.indicators?.adjclose?.[0]?.adjclose ?? [];
  if (!result || !quote || timestamps.length === 0) return [];

  return timestamps.flatMap((timestamp, index) => {
    const closePrice = quote.close?.[index];
    if (closePrice === null || closePrice === undefined || !Number.isFinite(closePrice)) return [];

    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    return [
      {
        etfId,
        pricedAt: date,
        openPrice: finiteNumberOrNull(quote.open?.[index]),
        highPrice: finiteNumberOrNull(quote.high?.[index]),
        lowPrice: finiteNumberOrNull(quote.low?.[index]),
        closePrice,
        adjustedClosePrice: finiteNumberOrNull(adjustedClose[index]),
        volume: finiteNumberOrNull(quote.volume?.[index]),
        source: defaultSource,
      },
    ];
  });
}

function finiteNumberOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function yahooHttpErrorMessage(response: Response, symbol: string): Promise<string> {
  let yahooMessage = '';
  try {
    const payload = (await response.clone().json()) as YahooChartResponse;
    yahooMessage = payload.chart?.error?.description ?? '';
  } catch {
    yahooMessage = '';
  }

  if (response.status === 404) {
    const suffixHint = looksLikeIsin(symbol)
      ? `L’identifiant ${symbol} ressemble à un ISIN; Yahoo attend un symbole coté, par exemple IE000I8KRLL9.SG, SEMI.AS ou SEC0.DE selon la place.`
      : `Vérifier le suffixe de place du symbole Yahoo, par exemple .PA, .AS, .DE, .L ou .SG.`;
    return `Symbole Yahoo introuvable (${response.status}). ${suffixHint}`;
  }

  return `Yahoo Finance indisponible (${response.status})${yahooMessage ? `: ${yahooMessage}` : ''}`;
}

function looksLikeIsin(value: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(value.toUpperCase());
}
