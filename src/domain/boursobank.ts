import type { ETF } from '../types';

const BOURSOBANK_TRACKER_BASE_URL = 'https://bourse.boursobank.com/bourse/trackers/cours/';

export function boursobankEtfUrl(etf: Pick<ETF, 'boursoIdentifier'>): string | null {
  const identifier = etf.boursoIdentifier?.trim();
  if (!identifier) return null;
  return `${BOURSOBANK_TRACKER_BASE_URL}${encodeURIComponent(identifier)}/`;
}
