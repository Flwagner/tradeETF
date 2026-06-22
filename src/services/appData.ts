import { computeMomentumV1 } from '../domain/momentum';
import { computeTrailingStop } from '../domain/trailingStop';
import { isSupabaseConfigured } from '../lib/supabase';
import type { ETF, EtfWithData, PricePoint } from '../types';
import { listEtfs } from './etfs';
import { listPrices } from './prices';
import { listLatestSnapshots } from './snapshots';

export async function loadEtfData(): Promise<EtfWithData[]> {
  if (!isSupabaseConfigured) return [];

  const etfs = await listEtfs();
  const snapshots = await listLatestSnapshots();
  const snapshotByEtf = new Map(snapshots.map((snapshot) => [snapshot.etfId, snapshot]));
  const rows = await Promise.all(
    etfs.map(async (etf) => {
      const prices = await listPrices(etf.id);
      const snapshot =
        snapshotByEtf.get(etf.id) ?? (prices.length >= 2 ? computeMomentumV1(etf.id, prices) : null);
      return {
        etf,
        prices,
        snapshot,
        trailingStop: computeTrailingStop(prices),
      };
    }),
  );
  return rows;
}

export function buildRows(etfs: ETF[], pricesByEtf: Map<string, PricePoint[]>): EtfWithData[] {
  return etfs.map((etf) => {
    const prices = pricesByEtf.get(etf.id) ?? [];
    return {
      etf,
      prices,
      snapshot: prices.length >= 2 ? computeMomentumV1(etf.id, prices) : null,
      trailingStop: computeTrailingStop(prices),
    };
  });
}
