import { requireSupabase } from '../lib/supabase';
import type { PricePoint } from '../types';
import { sortPrices } from '../domain/momentum';

type PriceRow = {
  id?: string;
  etf_id: string;
  priced_at: string;
  open_price: number | null;
  high_price: number | null;
  low_price: number | null;
  close_price: number;
  adjusted_close_price: number | null;
  volume: number | null;
  source: string;
};

export async function listPrices(etfId: string): Promise<PricePoint[]> {
  const { data, error } = await requireSupabase()
    .from('price_points')
    .select('*')
    .eq('etf_id', etfId)
    .order('priced_at', { ascending: true });
  if (error) throw error;
  return sortPrices((data ?? []).map(fromRow));
}

export async function listLatestPrices(): Promise<PricePoint[]> {
  const { data, error } = await requireSupabase()
    .from('price_points')
    .select('*')
    .order('priced_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(fromRow);
}

export async function upsertPrices(prices: PricePoint[]): Promise<void> {
  if (prices.length === 0) return;
  const { error } = await requireSupabase()
    .from('price_points')
    .upsert(prices.map(toRow), { onConflict: 'etf_id,priced_at,source' });
  if (error) throw error;
}

export function fromRow(row: PriceRow): PricePoint {
  return {
    id: row.id,
    etfId: row.etf_id,
    pricedAt: row.priced_at,
    openPrice: row.open_price,
    highPrice: row.high_price,
    lowPrice: row.low_price,
    closePrice: Number(row.close_price),
    adjustedClosePrice: row.adjusted_close_price === null ? null : Number(row.adjusted_close_price),
    volume: row.volume,
    source: row.source,
  };
}

function toRow(price: PricePoint): PriceRow {
  const row: PriceRow = {
    etf_id: price.etfId,
    priced_at: price.pricedAt,
    open_price: price.openPrice,
    high_price: price.highPrice,
    low_price: price.lowPrice,
    close_price: price.closePrice,
    adjusted_close_price: price.adjustedClosePrice,
    volume: price.volume,
    source: price.source,
  };
  if (price.id) row.id = price.id;
  return row;
}
