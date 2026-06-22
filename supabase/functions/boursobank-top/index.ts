type BoursobankTopEtf = {
  rank: number;
  name: string;
  isin: string;
  boursoIdentifier: string;
  url: string;
};

const SEARCH_URL = 'https://www.boursorama.com/bourse/trackers/recherche/';
const USER_AGENT = 'Mozilla/5.0 tradeETF/0.1';

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
    const { limit = 15 } = await request.json().catch(() => ({ limit: 15 }));
    const requestedLimit = clampNumber(Number(limit), 1, 20);
    const searchHtml = await fetchHtml(SEARCH_URL);
    const entries = parseTopEntries(searchHtml).slice(0, requestedLimit);

    const withIsin = await Promise.all(
      entries.map(async (entry): Promise<BoursobankTopEtf | null> => {
        const detailHtml = await fetchHtml(entry.url);
        const isin = parseIsin(detailHtml);
        if (!isin) return null;
        return { ...entry, isin };
      }),
    );

    return json({
      etfs: withIsin.filter((entry): entry is BoursobankTopEtf => Boolean(entry)),
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erreur Boursobank inconnue.' }, 500);
  }
});

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`Boursobank indisponible (${response.status}) pour ${url}`);
  }
  return response.text();
}

function parseTopEntries(html: string): Array<Omit<BoursobankTopEtf, 'isin'>> {
  const anchorRegex = /<a\b[^>]*href=(["'])([^"']*\/bourse\/trackers\/cours\/[^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set<string>();
  const entries: Array<Omit<BoursobankTopEtf, 'isin'>> = [];
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null) {
    const path = normalizePath(match[2]);
    const boursoIdentifier = path.match(/\/bourse\/trackers\/cours\/([^/]+)\//)?.[1] ?? '';
    const name = cleanHtml(match[3]);
    if (!boursoIdentifier || !name || seen.has(path)) continue;

    seen.add(path);
    entries.push({
      rank: entries.length + 1,
      name,
      boursoIdentifier,
      url: `https://www.boursorama.com${path}`,
    });
  }

  return entries;
}

function parseIsin(html: string): string | null {
  const pageVarsMatch = html.match(/"fv_code_isin"\s*:\s*"([A-Z]{2}[A-Z0-9]{9}[0-9])(?:_[^"]*)?"/);
  if (pageVarsMatch?.[1]) return pageVarsMatch[1];

  return html.match(/\b[A-Z]{2}[A-Z0-9]{9}[0-9]\b/)?.[0] ?? null;
}

function normalizePath(href: string): string {
  const url = href.startsWith('http') ? new URL(href) : new URL(href, 'https://www.boursorama.com');
  return url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
}

function cleanHtml(html: string): string {
  return decodeHtml(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
