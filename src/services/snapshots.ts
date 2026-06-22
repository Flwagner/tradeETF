import { requireSupabase } from '../lib/supabase';
import type { MomentumSnapshot } from '../types';

type SnapshotRow = {
  id?: string;
  etf_id: string;
  computed_at: string;
  strategy_code: 'momentum_v1';
  score: number;
  performance_1_month: number | null;
  performance_3_months: number | null;
  performance_6_months: number | null;
  performance_12_months: number | null;
  volatility_annualized: number | null;
  max_drawdown: number | null;
  moving_average_50: number | null;
  moving_average_200: number | null;
  distance_to_moving_average_200: number | null;
  atr_14: number | null;
  signal: 'buy' | 'watch' | 'avoid';
  details: MomentumSnapshot['details'];
};

export async function listLatestSnapshots(): Promise<MomentumSnapshot[]> {
  const { data, error } = await requireSupabase()
    .from('momentum_snapshots')
    .select('*')
    .eq('strategy_code', 'momentum_v1')
    .order('computed_at', { ascending: false });
  if (error) throw error;
  const latest = new Map<string, MomentumSnapshot>();
  for (const row of data ?? []) {
    const snapshot = fromRow(row);
    if (!latest.has(snapshot.etfId)) latest.set(snapshot.etfId, snapshot);
  }
  return [...latest.values()];
}

export async function upsertSnapshots(snapshots: MomentumSnapshot[]): Promise<void> {
  if (snapshots.length === 0) return;
  const { error } = await requireSupabase()
    .from('momentum_snapshots')
    .upsert(snapshots.map(toRow), { onConflict: 'etf_id,computed_at,strategy_code' });
  if (error) throw error;
}

export function fromRow(row: SnapshotRow): MomentumSnapshot {
  return {
    id: row.id,
    etfId: row.etf_id,
    computedAt: row.computed_at,
    strategyCode: row.strategy_code,
    score: Number(row.score),
    performance1Month: nullableNumber(row.performance_1_month),
    performance3Months: nullableNumber(row.performance_3_months),
    performance6Months: nullableNumber(row.performance_6_months),
    performance12Months: nullableNumber(row.performance_12_months),
    volatilityAnnualized: nullableNumber(row.volatility_annualized),
    maxDrawdown: nullableNumber(row.max_drawdown),
    movingAverage50: nullableNumber(row.moving_average_50),
    movingAverage200: nullableNumber(row.moving_average_200),
    distanceToMovingAverage200: nullableNumber(row.distance_to_moving_average_200),
    atr14: nullableNumber(row.atr_14),
    signal: row.signal,
    details: row.details,
  };
}

function toRow(snapshot: MomentumSnapshot): SnapshotRow {
  const row: SnapshotRow = {
    etf_id: snapshot.etfId,
    computed_at: snapshot.computedAt,
    strategy_code: snapshot.strategyCode,
    score: snapshot.score,
    performance_1_month: snapshot.performance1Month,
    performance_3_months: snapshot.performance3Months,
    performance_6_months: snapshot.performance6Months,
    performance_12_months: snapshot.performance12Months,
    volatility_annualized: snapshot.volatilityAnnualized,
    max_drawdown: snapshot.maxDrawdown,
    moving_average_50: snapshot.movingAverage50,
    moving_average_200: snapshot.movingAverage200,
    distance_to_moving_average_200: snapshot.distanceToMovingAverage200,
    atr_14: snapshot.atr14,
    signal: snapshot.signal,
    details: snapshot.details,
  };
  if (snapshot.id) row.id = snapshot.id;
  return row;
}

function nullableNumber(value: number | null): number | null {
  return value === null ? null : Number(value);
}
