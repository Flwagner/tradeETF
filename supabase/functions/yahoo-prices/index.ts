type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        exchangeTimezoneName?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          open?: Array<number | null>;
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Méthode non supportée.' }, 405);
  }

  try {
    const { symbol, etfId, since } = await request.json();
    const providerSymbol = String(symbol ?? '').trim();
    const resolvedEtfId = String(etfId ?? '').trim();
    const startDate = String(since ?? '').trim();

    if (!providerSymbol || !resolvedEtfId || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      return json({ error: 'Paramètres Yahoo invalides.' }, 400);
    }

    const period1 = Math.floor(new Date(`${startDate}T00:00:00`).getTime() / 1000);
    const period2 = Math.floor(Date.now() / 1000);
    const params = new URLSearchParams({
      period1: String(period1),
      period2: String(period2),
      interval: '1d',
      events: 'history',
      includeAdjustedClose: 'true',
    });
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(providerSymbol)}?${params.toString()}`,
      {
        headers: {
          accept: 'application/json',
          'user-agent': 'Mozilla/5.0 tradeETF/0.1',
        },
      },
    );
    const payload = await response.json() as YahooChartResponse;

    if (!response.ok) {
      return json({
        error: yahooHttpErrorMessage(response.status, providerSymbol, payload.chart?.error?.description),
      }, response.status);
    }

    if (payload.chart?.error) {
      return json({
        error: `Yahoo Finance: ${payload.chart.error.description ?? payload.chart.error.code ?? 'réponse invalide'}`,
      }, 502);
    }

    return json({
      prices: parseYahooPrices(payload, resolvedEtfId),
      providerSymbol,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erreur Yahoo inconnue.' }, 500);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function parseYahooPrices(payload: YahooChartResponse, etfId: string) {
  const result = payload.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  const adjustedClose = result?.indicators?.adjclose?.[0]?.adjclose ?? [];
  if (!result || !quote || timestamps.length === 0) return [];

  return timestamps.flatMap((timestamp, index) => {
    const closePrice = finiteNumberOrNull(quote.close?.[index]);
    if (closePrice === null) return [];

    return [{
      etfId,
      pricedAt: new Date(timestamp * 1000).toISOString().slice(0, 10),
      openPrice: finiteNumberOrNull(quote.open?.[index]),
      highPrice: finiteNumberOrNull(quote.high?.[index]),
      lowPrice: finiteNumberOrNull(quote.low?.[index]),
      closePrice,
      adjustedClosePrice: finiteNumberOrNull(adjustedClose[index]),
      volume: finiteNumberOrNull(quote.volume?.[index]),
      source: 'yahoo',
    }];
  });
}

function finiteNumberOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function yahooHttpErrorMessage(status: number, symbol: string, description?: string): string {
  if (status === 404) {
    const suffixHint = /^[A-Z]{2}[A-Z0-9]{10}$/.test(symbol.toUpperCase())
      ? `L’identifiant ${symbol} ressemble à un ISIN; Yahoo attend un symbole coté.`
      : 'Vérifier le suffixe de place du symbole Yahoo, par exemple .PA, .AS, .DE, .L ou .SG.';
    return `Symbole Yahoo introuvable (${status}). ${suffixHint}`;
  }

  return `Yahoo Finance indisponible (${status})${description ? `: ${description}` : ''}`;
}
