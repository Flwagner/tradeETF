#!/usr/bin/env node

/**
 * Automated daily price sync for tradeETF.
 *
 * Calls Supabase Edge Functions to fetch Yahoo Finance prices,
 * persists them via the Supabase REST API, and recomputes momentum snapshots.
 *
 * Usage:
 *   node scripts/sync-prices.mjs              # daily price refresh
 *   node scripts/sync-prices.mjs --with-boursobank  # also refresh Boursobank top
 *
 * Required env vars:
 *   SUPABASE_URL        – Supabase project URL (https://xxx.supabase.co)
 *   SUPABASE_ANON_KEY   – Supabase publishable / anon key
 */

import { createClient } from '@supabase/supabase-js';

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const WITH_BOURSOBANK = process.argv.includes('--with-boursobank');
const SYNC_SINCE_DAYS = 7;
const FULL_HISTORY_DAYS = 730;
const DELAY_BETWEEN_ETFS_MS = 1500;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Edge Function callers ─────────────────────────────────────────────────────

async function callEdgeFunction(name, body) {
  const url = `${SUPABASE_URL}/functions/v1/${name}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Edge Function ${name} failed (${response.status}): ${text}`);
  }

  return response.json();
}

async function fetchYahooPrices(symbol, etfId, since) {
  const data = await callEdgeFunction('yahoo-prices', { symbol, etfId, since });
  return data?.prices ?? [];
}

async function searchYahooByIsin(isin) {
  const data = await callEdgeFunction('yahoo-search', { isin });
  return data?.etf ?? null;
}

async function fetchBoursobankTop(limit = 15) {
  const data = await callEdgeFunction('boursobank-top', { limit });
  return data?.etfs ?? [];
}

// ── Supabase DB helpers ───────────────────────────────────────────────────────

async function listActiveEtfs() {
  const { data, error } = await supabase
    .from('etfs')
    .select('*')
    .eq('active', true)
    .order('symbol');
  if (error) throw error;
  return (data ?? []).map(fromEtfRow);
}

async function listAllPrices(etfId) {
  const { data, error } = await supabase
    .from('price_points')
    .select('*')
    .eq('etf_id', etfId)
    .order('priced_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(fromPriceRow);
}

async function upsertPrices(prices) {
  if (prices.length === 0) return;
  const rows = prices.map(toPriceRow);
  const { error } = await supabase
    .from('price_points')
    .upsert(rows, { onConflict: 'etf_id,priced_at,source' });
  if (error) throw error;
}

async function upsertSnapshots(snapshots) {
  if (snapshots.length === 0) return;
  const rows = snapshots.map(toSnapshotRow);
  const { error } = await supabase
    .from('momentum_snapshots')
    .upsert(rows, { onConflict: 'etf_id,computed_at,strategy_code' });
  if (error) throw error;
}

async function upsertEtf(etf) {
  const row = toEtfRow(etf);
  const { data, error } = await supabase
    .from('etfs')
    .upsert(row, { onConflict: 'symbol,exchange' })
    .select('*')
    .single();
  if (error) throw error;
  return fromEtfRow(data);
}

// ── Row mappers (snake_case ↔ camelCase) ──────────────────────────────────────

function fromEtfRow(row) {
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

function toEtfRow(etf) {
  const row = {
    isin: etf.isin,
    symbol: etf.symbol,
    name: etf.name,
    exchange: etf.exchange,
    currency: etf.currency,
    pea_eligible: etf.peaEligible ?? false,
    active: etf.active ?? true,
    bourso_identifier: etf.boursoIdentifier ?? null,
    data_provider_symbol: etf.dataProviderSymbol ?? null,
  };
  if (etf.id) row.id = etf.id;
  return row;
}

function fromPriceRow(row) {
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

function toPriceRow(price) {
  return {
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
}

function toSnapshotRow(snapshot) {
  return {
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
}

// ── Momentum computation (mirrors src/domain/momentum.ts) ─────────────────────

const MOMENTUM_STRATEGY_CODE = 'momentum_v1';

const WEIGHTS = {
  momentum1M: 0.15,
  momentum3M: 0.25,
  momentum6M: 0.25,
  momentum12M: 0.1,
  trend: 0.15,
  risk: 0.1,
};

function metricClose(price) {
  return price.adjustedClosePrice && price.adjustedClosePrice > 0
    ? price.adjustedClosePrice
    : price.closePrice;
}

function sortPrices(prices) {
  return [...prices].sort((a, b) => a.pricedAt.localeCompare(b.pricedAt));
}

function computeMomentumV1(etfId, prices, computedAt) {
  if (prices.length < 2) {
    throw new Error('momentum_v1 requires at least 2 price points');
  }

  const sorted = sortPrices(prices);
  const latest = sorted[sorted.length - 1];
  const latestMetricClose = metricClose(latest);
  const latestDate = computedAt ?? latest.pricedAt;

  const performance1Month = performanceSince(sorted, latest.pricedAt, 1);
  const performance3Months = performanceSince(sorted, latest.pricedAt, 3);
  const performance6Months = performanceSince(sorted, latest.pricedAt, 6);
  const performance12Months = performanceSince(sorted, latest.pricedAt, 12);
  const movingAverage50Val = movingAverage(sorted, 50);
  const movingAverage200Val = movingAverage(sorted, 200);
  const distanceToMovingAverage200 =
    movingAverage200Val === null ? null : latestMetricClose / movingAverage200Val - 1;
  const volatilityAnnualized = annualizedVolatility(sorted);
  const maxDrawdown = computeMaxDrawdown(sorted);
  const atr14 = computeAtr14(sorted);

  const momentum1M = momentumComponent(performance1Month);
  const momentum3M = momentumComponent(performance3Months);
  const momentum6M = momentumComponent(performance6Months);
  const momentum12M = momentumComponent(performance12Months);
  const trend = trendComponent(latestMetricClose, movingAverage50Val, movingAverage200Val);
  const risk = riskComponent(
    volatilityAnnualized,
    maxDrawdown,
    atr14,
    latestMetricClose,
    distanceToMovingAverage200,
  );

  const score =
    WEIGHTS.momentum1M * momentum1M +
    WEIGHTS.momentum3M * momentum3M +
    WEIGHTS.momentum6M * momentum6M +
    WEIGHTS.momentum12M * momentum12M +
    WEIGHTS.trend * trend +
    WEIGHTS.risk * risk;

  const enoughHistory = sorted.length >= 126 && performance3Months !== null && performance6Months !== null;
  const signal = deriveSignal(enoughHistory, movingAverage200Val, latestMetricClose, score);

  return {
    etfId,
    computedAt: latestDate,
    strategyCode: MOMENTUM_STRATEGY_CODE,
    score,
    performance1Month,
    performance3Months,
    performance6Months,
    performance12Months,
    volatilityAnnualized,
    maxDrawdown,
    movingAverage50: movingAverage50Val,
    movingAverage200: movingAverage200Val,
    distanceToMovingAverage200,
    atr14,
    signal,
    details: {
      latest_close: latest.closePrice,
      latest_metric_close: latestMetricClose,
      latest_priced_at: latest.pricedAt,
      price_basis: 'adjusted_close_when_available',
      price_points: sorted.length,
      enough_history: enoughHistory,
      score_profile: 'hybrid_momentum_3_to_6_months',
      weights: WEIGHTS,
      components: {
        momentum_1_month: momentum1M,
        momentum_3_months: momentum3M,
        momentum_6_months: momentum6M,
        momentum_12_months: momentum12M,
        trend,
        risk,
      },
    },
  };
}

function deriveSignal(enoughHistory, movingAverage200, latestClose, score) {
  if (!enoughHistory) return 'watch';
  if (movingAverage200 !== null && latestClose < movingAverage200) return 'watch';
  if (score >= 65) return 'buy';
  if (score < 45) return 'avoid';
  return 'watch';
}

function performanceSince(prices, latestDate, months) {
  const targetDate = addMonths(latestDate, -months);
  const reference = findAtOrBefore(prices, targetDate);
  if (!reference) return null;
  return metricClose(prices[prices.length - 1]) / metricClose(reference) - 1;
}

function findAtOrBefore(prices, date) {
  for (let index = prices.length - 1; index >= 0; index -= 1) {
    if (prices[index].pricedAt <= date) return prices[index];
  }
  return null;
}

function addMonths(date, months) {
  const value = new Date(`${date}T00:00:00`);
  value.setMonth(value.getMonth() + months);
  return value.toISOString().slice(0, 10);
}

function movingAverage(prices, period) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((sum, price) => sum + metricClose(price), 0) / period;
}

function annualizedVolatility(prices) {
  const slice = prices.slice(-253);
  if (slice.length < 2) return null;
  const returns = slice
    .slice(1)
    .map((price, index) => Math.log(metricClose(price) / metricClose(slice[index])));
  if (returns.length < 2) return null;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

function computeMaxDrawdown(prices) {
  const slice = prices.slice(-252);
  if (slice.length < 2) return null;
  let peak = metricClose(slice[0]);
  let maxDrawdown = 0;
  for (const price of slice) {
    const close = metricClose(price);
    peak = Math.max(peak, close);
    maxDrawdown = Math.min(maxDrawdown, close / peak - 1);
  }
  return maxDrawdown;
}

function computeAtr14(prices) {
  if (prices.length < 15) return null;
  const slice = prices.slice(-15);
  const ranges = slice.slice(1).map((price, index) => {
    const previousClose = metricClose(slice[index]);
    const high = price.highPrice ?? metricClose(price);
    const low = price.lowPrice ?? metricClose(price);
    return Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
  });
  return ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
}

function momentumComponent(performance) {
  if (performance === null) return 50;
  return clamp(50 + performance * 100, 0, 100);
}

function trendComponent(latestClose, movingAverage50, movingAverage200) {
  if (movingAverage50 === null) return 50;
  if (movingAverage200 !== null && latestClose > movingAverage50 && movingAverage50 > movingAverage200)
    return 100;
  if (latestClose > movingAverage50 && (movingAverage200 === null || latestClose > movingAverage200))
    return 80;
  if (latestClose > movingAverage50) return 70;
  return 25;
}

function riskComponent(volatilityAnnualized, maxDrawdown, atr14, latestClose, distanceToMovingAverage200) {
  const volatilityScore = volatilityAnnualized === null ? 50 : clamp(100 - volatilityAnnualized * 120, 0, 100);
  const drawdownScore = maxDrawdown === null ? 50 : clamp(100 + maxDrawdown * 120, 0, 100);
  const atrScore = atr14 === null ? 50 : clamp(100 - (atr14 / latestClose) * 1000, 0, 100);
  const extensionScore = extensionComponent(distanceToMovingAverage200);
  return 0.35 * volatilityScore + 0.25 * drawdownScore + 0.25 * atrScore + 0.15 * extensionScore;
}

function extensionComponent(distance) {
  if (distance === null) return 50;
  if (distance < -0.05) return 40;
  if (distance <= 0.25) return 100;
  return clamp(100 - (distance - 0.25) * 160, 30, 100);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatDate(d);
}

// ── Boursobank import ─────────────────────────────────────────────────────────

async function importBoursobankTop() {
  console.log('\n── Boursobank top import ──');
  const topEtfs = await fetchBoursobankTop(15);
  console.log(`  Found ${topEtfs.length} ETFs from Boursobank.`);

  let added = 0;
  for (const entry of topEtfs) {
    try {
      const resolved = await searchYahooByIsin(entry.isin);
      if (!resolved) {
        console.log(`  ⚠ Could not resolve ISIN ${entry.isin} (${entry.name})`);
        continue;
      }

      const etf = await upsertEtf({
        isin: entry.isin,
        symbol: resolved.symbol ?? entry.isin,
        name: resolved.name ?? entry.name,
        exchange: resolved.exchange ?? 'XPAR',
        currency: resolved.currency ?? 'EUR',
        peaEligible: false,
        active: true,
        boursoIdentifier: entry.boursoIdentifier,
        dataProviderSymbol: resolved.dataProviderSymbol ?? null,
      });

      added += 1;
      console.log(`  ✓ ${etf.symbol} (${etf.name})`);

      const symbol = etf.dataProviderSymbol ?? etf.symbol;
      const prices = await fetchYahooPrices(symbol, etf.id, daysAgo(FULL_HISTORY_DAYS));
      if (prices.length > 0) {
        await upsertPrices(prices);
        console.log(`    ${prices.length} price points imported`);
      }

      await delay(DELAY_BETWEEN_ETFS_MS);
    } catch (err) {
      console.error(`  ✗ Failed for ${entry.isin}: ${err.message}`);
    }
  }

  console.log(`  ${added} new ETFs added from Boursobank.`);
}

// ── Main sync ─────────────────────────────────────────────────────────────────

async function syncPrices() {
  console.log('═══════════════════════════════════════════');
  console.log(`tradeETF price sync – ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════');

  const etfs = await listActiveEtfs();
  console.log(`\nActive ETFs: ${etfs.length}`);

  if (etfs.length === 0) {
    console.log('No active ETFs to sync.');
    return;
  }

  console.log('\n── Price sync ──');
  let totalPrices = 0;
  let errors = 0;

  for (const etf of etfs) {
    const symbol = etf.dataProviderSymbol ?? etf.symbol;
    try {
      const prices = await fetchYahooPrices(symbol, etf.id, daysAgo(SYNC_SINCE_DAYS));
      if (prices.length > 0) {
        await upsertPrices(prices);
        totalPrices += prices.length;
        console.log(`  ✓ ${etf.symbol}: ${prices.length} price points`);
      } else {
        console.log(`  – ${etf.symbol}: no new prices`);
      }
    } catch (err) {
      errors += 1;
      console.error(`  ✗ ${etf.symbol}: ${err.message}`);
    }

    await delay(DELAY_BETWEEN_ETFS_MS);
  }

  console.log(`\nPrices synced: ${totalPrices} total, ${errors} errors`);

  console.log('\n── Momentum recomputation ──');
  let snapshotsComputed = 0;

  for (const etf of etfs) {
    try {
      const allPrices = await listAllPrices(etf.id);
      if (allPrices.length < 2) {
        console.log(`  – ${etf.symbol}: insufficient prices (${allPrices.length}), skipping`);
        continue;
      }

      const snapshot = computeMomentumV1(etf.id, allPrices);
      await upsertSnapshots([snapshot]);
      snapshotsComputed += 1;
      console.log(
        `  ✓ ${etf.symbol}: score=${snapshot.score.toFixed(1)} signal=${snapshot.signal}`,
      );
    } catch (err) {
      console.error(`  ✗ ${etf.symbol}: ${err.message}`);
    }
  }

  console.log(`\nSnapshots computed: ${snapshotsComputed}/${etfs.length}`);

  if (WITH_BOURSOBANK) {
    await importBoursobankTop();
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('Sync complete.');
  console.log('═══════════════════════════════════════════');
}

// ── Run ───────────────────────────────────────────────────────────────────────

syncPrices().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
