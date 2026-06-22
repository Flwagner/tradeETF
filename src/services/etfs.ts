import { requireSupabase } from '../lib/supabase';
import type { ETF } from '../types';

type EtfRow = {
  id: string;
  isin: string;
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  pea_eligible: boolean;
  active: boolean;
  bourso_identifier: string | null;
  data_provider_symbol: string | null;
};

export async function listEtfs(): Promise<ETF[]> {
  const { data, error } = await requireSupabase()
    .from('etfs')
    .select('*')
    .eq('active', true)
    .order('symbol');
  if (error) throw error;
  return (data ?? []).map(fromRow);
}

export async function upsertEtf(etf: Omit<ETF, 'id'> & { id?: string }): Promise<ETF> {
  const payload = toRow(etf);
  const { data, error } = await requireSupabase()
    .from('etfs')
    .upsert(payload, { onConflict: etf.id ? 'id' : 'symbol,exchange' })
    .select('*')
    .single();
  if (error) throw error;
  return fromRow(data);
}

export async function deleteEtf(id: string): Promise<void> {
  const { error } = await requireSupabase().from('etfs').delete().eq('id', id);
  if (error) throw error;
}

export function fromRow(row: EtfRow): ETF {
  return {
    id: row.id,
    isin: row.isin,
    symbol: row.symbol,
    name: row.name,
    exchange: row.exchange,
    currency: row.currency,
    peaEligible: row.pea_eligible,
    active: row.active,
    boursoIdentifier: row.bourso_identifier,
    dataProviderSymbol: row.data_provider_symbol,
  };
}

function toRow(etf: Omit<ETF, 'id'> & { id?: string }) {
  const row = {
    isin: etf.isin,
    symbol: etf.symbol,
    name: etf.name,
    exchange: etf.exchange,
    currency: etf.currency,
    pea_eligible: etf.peaEligible,
    active: etf.active,
    bourso_identifier: etf.boursoIdentifier,
    data_provider_symbol: etf.dataProviderSymbol,
  };
  return etf.id ? { id: etf.id, ...row } : row;
}
