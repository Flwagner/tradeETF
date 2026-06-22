type YahooSearchQuote = {
  exchange?: string;
  longname?: string;
  quoteType?: string;
  shortname?: string;
  symbol?: string;
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
    const { isin, fallbackCurrency = 'EUR' } = await request.json();
    const normalizedIsin = String(isin ?? '').trim().toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(normalizedIsin)) {
      return json({ error: `Code ISIN invalide: ${isin}` }, 400);
    }

    const params = new URLSearchParams({
      q: normalizedIsin,
      quotesCount: '10',
      newsCount: '0',
    });
    const response = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?${params.toString()}`, {
      headers: {
        accept: 'application/json',
        'user-agent': 'Mozilla/5.0 tradeETF/0.1',
      },
    });

    if (!response.ok) {
      return json({ error: `Recherche Yahoo indisponible (${response.status}).` }, response.status);
    }

    const payload = await response.json();
    const quotes = Array.isArray(payload.quotes) ? payload.quotes as YahooSearchQuote[] : [];
    const quote = quotes.find((item) => item.quoteType === 'ETF') ?? quotes[0] ?? null;
    if (!quote?.symbol) {
      return json({ etf: null });
    }

    const providerSymbol = quote.symbol;
    return json({
      etf: {
        isin: normalizedIsin,
        symbol: localSymbol(providerSymbol),
        name: quote.longname ?? quote.shortname ?? providerSymbol,
        exchange: exchangeCode(quote.exchange ?? ''),
        currency: fallbackCurrency || 'EUR',
        peaEligible: false,
        active: true,
        boursoIdentifier: null,
        dataProviderSymbol: providerSymbol,
      },
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

function localSymbol(providerSymbol: string): string {
  return (providerSymbol.split('.')[0] || providerSymbol).toUpperCase();
}

function exchangeCode(exchange: string): string {
  switch (exchange.toUpperCase()) {
    case 'PAR':
      return 'XPAR';
    case 'AMS':
      return 'XAMS';
    case 'GER':
      return 'XETR';
    case 'STU':
      return 'XSTU';
    case 'LSE':
      return 'XLON';
    default:
      return exchange ? exchange.toUpperCase() : 'UNKNOWN';
  }
}
