import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Save, Trash2, Upload } from 'lucide-react';
import { CollapsiblePanel } from '../components/CollapsiblePanel';
import { BoursobankIsinLink } from '../components/BoursobankIsinLink';
import { Disclaimer } from '../components/Disclaimer';
import { PriceSparkline } from '../components/PriceSparkline';
import { SignalBadge } from '../components/SignalBadge';
import { Stat } from '../components/Stat';
import { formatCurrency, formatDate, formatNumber, formatPercent, formatSignedPercent } from '../domain/format';
import { computeMomentumV1 } from '../domain/momentum';
import { computeTrailingStop } from '../domain/trailingStop';
import { isSupabaseConfigured } from '../lib/supabase';
import { buildRows, loadEtfData } from '../services/appData';
import { deleteAllEtfs, deleteEtf, upsertEtf } from '../services/etfs';
import {
  parseEtfTextarea,
  searchYahooEtfByIsin,
  tryBoursobankTopEtf,
  tryYahooDownload,
} from '../services/importers';
import { upsertPrices } from '../services/prices';
import { upsertSnapshots } from '../services/snapshots';
import type { EtfWithData, ETF, PricePoint } from '../types';

export function HomePage() {
  const [rows, setRows] = useState<EtfWithData[]>([]);
  const [status, setStatus] = useState('Chargement...');
  const [etfInput, setEtfInput] = useState('');
  const [since, setSince] = useState(new Date(new Date().setFullYear(new Date().getFullYear() - 2)).toISOString().slice(0, 10));
  const [boursobankLimit, setBoursobankLimit] = useState(15);
  const [isImportingPrices, setIsImportingPrices] = useState(false);
  const [isImportingTop, setIsImportingTop] = useState(false);
  const [isRefreshingScores, setIsRefreshingScores] = useState(false);
  const [isUniverseOpen, setIsUniverseOpen] = useState(true);
  const [isRankingOpen, setIsRankingOpen] = useState(true);

  useEffect(() => {
    loadEtfData()
      .then((data) => {
        setRows(data);
        setStatus(isSupabaseConfigured ? 'Données Supabase chargées.' : 'Supabase non configuré.');
      })
      .catch((error: Error) => setStatus(error.message));
  }, []);

  const ranking = useMemo(
    () => [...rows].filter((row) => row.snapshot).sort((a, b) => (b.snapshot?.score ?? 0) - (a.snapshot?.score ?? 0)),
    [rows],
  );
  const best = ranking[0] ?? null;
  const latestPrice = latestPriceOf(best?.prices ?? []);
  const bestVisiblePrices = useMemo(() => filterLastMonths(best?.prices ?? [], 3), [best]);
  const isFresh = Boolean(best?.snapshot && latestPrice && daysSince(latestPrice.pricedAt) <= 3 && daysSince(best.snapshot.computedAt) <= 1);

  async function refreshDecision(sourceRows = rows) {
    if (sourceRows.length === 0) return sourceRows;

    setIsRefreshingScores(true);
    try {
      const { nextRows, snapshotCount } = await computeRowsWithFreshScores(sourceRows);
      setRows(nextRows);
      setStatus(`${snapshotCount} snapshots momentum recalculés${isSupabaseConfigured ? ' et persistés.' : ' en local.'}`);
      return nextRows;
    } catch (error) {
      setStatus((error as Error).message);
      return sourceRows;
    } finally {
      setIsRefreshingScores(false);
    }
  }

  async function computeRowsWithFreshScores(sourceRows: EtfWithData[]) {
    const snapshots = sourceRows.flatMap((row) => {
      if (row.prices.length < 2) return [];
      return [computeMomentumV1(row.etf.id, row.prices, new Date().toISOString().slice(0, 10))];
    });
    if (isSupabaseConfigured) await upsertSnapshots(snapshots);
    return {
      snapshotCount: snapshots.length,
      nextRows: sourceRows.map((row) => ({
        ...row,
        snapshot: snapshots.find((snapshot) => snapshot.etfId === row.etf.id) ?? row.snapshot,
        trailingStop: computeTrailingStop(row.prices),
      })),
    };
  }

  async function addEtfs() {
    const parsed = parseEtfTextarea(etfInput);
    if (parsed.length === 0) return;
    setStatus('Résolution Yahoo des ETF...');
    const resolved = await Promise.all(parsed.map(resolveEtfForYahoo));
    if (isSupabaseConfigured) {
      const saved = await Promise.all(resolved.map((etf) => upsertEtf(etf)));
      setRows((current) => [...current, ...saved.map((etf) => ({ etf, prices: [], snapshot: null, trailingStop: computeTrailingStop([]) }))]);
      setStatus(`${saved.length} ETF ajoutés.`);
    } else {
      const saved: ETF[] = resolved.map((etf, index) => ({ ...etf, id: `local-${Date.now()}-${index}` }));
      setRows((current) => [...current, ...saved.map((etf) => ({ etf, prices: [], snapshot: null, trailingStop: computeTrailingStop([]) }))]);
      setStatus(`${saved.length} ETF ajoutés en local.`);
    }
  }

  async function refreshPricesThenDecision() {
    const nextRows = await importAllYahoo();
    if (nextRows.length === 0) return;
    await refreshDecision(nextRows);
  }

  async function importAllYahoo() {
    if (rows.length === 0) return rows;

    setIsImportingPrices(true);
    try {
      const { failures, importedPrices, nextRows } = await importYahooPricesForRows(rows);
      setRows(nextRows);

      const failureText = failures.length > 0 ? ` ${failures.length} échecs.` : '';
      setStatus(`${importedPrices.length} prix importés pour ${rows.length - failures.length}/${rows.length} ETF.${failureText}`);
      return nextRows;
    } catch (error) {
      setStatus((error as Error).message);
      return rows;
    } finally {
      setIsImportingPrices(false);
    }
  }

  async function importYahooPricesForRows(sourceRows: EtfWithData[]) {
    const importedPrices: PricePoint[] = [];
    const updatedEtfs = new Map<string, ETF>();
    const failures: string[] = [];

    for (const [index, row] of sourceRows.entries()) {
      try {
        setStatus(`Import Yahoo ${index + 1}/${sourceRows.length} · ${row.etf.symbol}...`);
        const etf = await resolveExistingEtfForYahoo(row.etf);
        updatedEtfs.set(etf.id, etf);
        const symbol = etf.dataProviderSymbol || etf.symbol;
        importedPrices.push(...(await tryYahooDownload(symbol, etf.id, since)));
      } catch (error) {
        failures.push(`${row.etf.symbol}: ${(error as Error).message}`);
      }
    }

    if (isSupabaseConfigured) await upsertPrices(importedPrices);

    return {
      failures,
      importedPrices,
      nextRows: mergeImportedPrices(sourceRows, importedPrices, updatedEtfs),
    };
  }

  async function importBoursobankTop() {
    if (!isSupabaseConfigured) {
      setStatus('Supabase est requis pour importer le top Boursobank.');
      return;
    }

    const limit = Math.min(20, Math.max(1, Math.trunc(boursobankLimit)));
    setIsImportingTop(true);
    try {
      setStatus(`Lecture du top ${limit} Boursobank...`);
      const topEtfs = await tryBoursobankTopEtf(limit);
      if (topEtfs.length === 0) {
        setStatus('Aucun ETF trouvé dans le top Boursobank.');
        return;
      }

      const saved: ETF[] = [];
      const failures: string[] = [];

      for (const item of topEtfs) {
        try {
          const resolved = await searchYahooEtfByIsin(item.isin, 'EUR');
          if (!resolved?.dataProviderSymbol) {
            throw new Error('symbole Yahoo introuvable');
          }
          saved.push(
            await upsertEtf({
              ...resolved,
              name: resolved.name || item.name,
              boursoIdentifier: item.boursoIdentifier,
              peaEligible: false,
              active: true,
            }),
          );
        } catch (error) {
          failures.push(`${item.isin}: ${(error as Error).message}`);
        }
      }

      let priceCount = 0;
      for (const etf of saved) {
        try {
          const prices = await tryYahooDownload(etf.dataProviderSymbol || etf.symbol, etf.id, since);
          await upsertPrices(prices);
          priceCount += prices.length;
        } catch (error) {
          failures.push(`${etf.symbol}: ${(error as Error).message}`);
        }
      }

      setRows(await loadEtfData());
      const failureText = failures.length > 0 ? ` ${failures.length} échecs.` : '';
      setStatus(`${saved.length} ETF Boursobank importés, ${priceCount} prix ajoutés.${failureText}`);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setIsImportingTop(false);
    }
  }

  function mergeImportedPrices(sourceRows: EtfWithData[], prices: PricePoint[], updatedEtfs = new Map<string, ETF>()) {
    const etfs = sourceRows.map((row) => updatedEtfs.get(row.etf.id) ?? row.etf);
    const priceMap = new Map(sourceRows.map((row) => [row.etf.id, row.prices]));
    for (const price of prices) {
      const existing = priceMap.get(price.etfId) ?? [];
      const merged = new Map([...existing, price].map((item) => [`${item.pricedAt}-${item.source}`, item]));
      priceMap.set(price.etfId, [...merged.values()].sort((a, b) => a.pricedAt.localeCompare(b.pricedAt)));
    }
    return buildRows(etfs, priceMap);
  }

  async function removeRow(row: EtfWithData) {
    if (isSupabaseConfigured) await deleteEtf(row.etf.id);
    setRows((current) => current.filter((item) => item.etf.id !== row.etf.id));
    setStatus(`${row.etf.symbol} supprimé.`);
  }

  async function removeAllRows() {
    if (rows.length === 0) return;
    const confirmed = window.confirm(
      `Supprimer les ${rows.length} ETF et toutes leurs données de prix/snapshots ?`,
    );
    if (!confirmed) return;

    try {
      setStatus('Suppression de tous les ETF...');
      if (isSupabaseConfigured) await deleteAllEtfs();
      setRows([]);
      setStatus(`${rows.length} ETF supprimés avec leurs données.`);
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  async function resolveEtfForYahoo(etf: Omit<ETF, 'id'>): Promise<Omit<ETF, 'id'>> {
    if (!isSupabaseConfigured) return etf;
    if (etf.dataProviderSymbol || !looksLikeIsin(etf.isin)) return etf;
    const resolved = await searchYahooEtfByIsin(etf.isin, etf.currency);
    return resolved
      ? {
          ...resolved,
          peaEligible: etf.peaEligible,
          active: etf.active,
          boursoIdentifier: etf.boursoIdentifier ?? resolved.boursoIdentifier,
        }
      : etf;
  }

  async function resolveExistingEtfForYahoo(etf: ETF): Promise<ETF> {
    if (etf.dataProviderSymbol || !looksLikeIsin(etf.isin)) return etf;
    const resolved = await searchYahooEtfByIsin(etf.isin, etf.currency);
    if (!resolved) {
      throw new Error(`Aucun symbole Yahoo trouvé pour ${etf.isin}`);
    }
    const saved = isSupabaseConfigured ? await upsertEtf({ ...resolved, id: etf.id }) : { ...etf, ...resolved };
    return saved;
  }

  return (
    <main className="page">
      <section className="dashboard-grid">
        <div className="panel decision-panel">
          <div className="panel-heading">
            <span>Décision maintenant</span>
            <button
              className="icon-button"
              onClick={refreshPricesThenDecision}
              title="Rafraîchir les prix puis recalculer la décision"
              disabled={rows.length === 0 || isImportingPrices || isRefreshingScores}
            >
              <RefreshCw size={17} className={isImportingPrices || isRefreshingScores ? 'spin' : undefined} />
            </button>
          </div>
          <h1>Quel ETF acheter ?</h1>
          {best?.snapshot ? (
            <>
              <div className="decision-main">
                <div>
                  <Link to={`/etfs/${best.etf.id}`} className="decision-symbol">
                    {best.etf.symbol}
                  </Link>
                  <p>{best.etf.name}</p>
                </div>
                <SignalBadge signal={best.snapshot.signal} />
              </div>
              <PriceSparkline prices={bestVisiblePrices} stopPrice={best.trailingStop.recommended?.stopPrice} />
              <div className="stat-grid">
                <Stat label="Prix actuel" value={formatCurrency(latestPrice?.closePrice, best.etf.currency)} />
                <Stat label="Stop conseillé" value={`${best.trailingStop.recommended?.percentage ?? '-'}% · ${formatCurrency(best.trailingStop.recommended?.stopPrice, best.etf.currency)}`} />
                <Stat label="Score" value={formatNumber(best.snapshot.score, 1)} tone={best.snapshot.signal === 'buy' ? 'success' : 'warning'} />
                <Stat
                  label="Fraîcheur"
                  value={`${isFresh ? 'Données fraîches' : 'À rafraîchir'} · ${formatDate(latestPrice?.pricedAt)}`}
                  tone={isFresh ? 'success' : 'warning'}
                />
              </div>
            </>
          ) : (
            <p className="muted">Ajoute des ETF et importe des prix pour obtenir une décision.</p>
          )}
          <Disclaimer />
        </div>

        <div className="panel import-panel">
          <div className="panel-heading">
            <span>Import</span>
            <Upload size={17} />
          </div>
          <label>
            ISIN/symboles
            <textarea
              value={etfInput}
              onChange={(event) => setEtfInput(event.target.value)}
              rows={4}
              placeholder="ISIN ou symbole,nom,place,devise,symbole Yahoo"
            />
          </label>
          <button onClick={addEtfs}>
            <Save size={16} />
            Ajouter à l’univers
          </button>
          <div className="form-row">
            <label>
              Historique depuis
              <input type="date" value={since} onChange={(event) => setSince(event.target.value)} />
            </label>
            <label>
              Top Boursobank
              <input
                type="number"
                min={1}
                max={20}
                value={boursobankLimit}
                onChange={(event) => setBoursobankLimit(Number(event.target.value))}
              />
            </label>
          </div>
          <div className="button-row">
            <button className="full-width" onClick={importBoursobankTop} disabled={isImportingTop}>
              <RefreshCw size={16} className={isImportingTop ? 'spin' : undefined} />
              {isImportingTop ? 'Import Boursobank...' : 'Importer le top Boursobank'}
            </button>
          </div>
        </div>
      </section>

      <CollapsiblePanel
        title={`Univers ETF · ${rows.length} suivis`}
        isOpen={isUniverseOpen}
        onToggle={() => setIsUniverseOpen((current) => !current)}
        actions={
          <>
            <small>{status}</small>
            <button
              className="icon-button"
              title="Rafraîchir tous les prix Yahoo"
              onClick={importAllYahoo}
              disabled={rows.length === 0 || isImportingPrices}
            >
              <RefreshCw size={16} className={isImportingPrices ? 'spin' : undefined} />
            </button>
            <button
              className="icon-button danger"
              title="Supprimer tous les ETF et leurs données"
              onClick={removeAllRows}
              disabled={rows.length === 0}
            >
              <Trash2 size={16} />
            </button>
          </>
        }
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ETF</th>
                <th>ISIN</th>
                <th>Dernier prix</th>
                <th>Dernière donnée</th>
                <th>Points</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rowLatestPrice = latestPriceOf(row.prices);
                const isStale = !rowLatestPrice || daysSince(rowLatestPrice.pricedAt) > 3;

                return (
                  <tr key={row.etf.id}>
                    <td data-label="ETF">
                      <Link to={`/etfs/${row.etf.id}`} className="table-title">{row.etf.symbol}</Link>
                      <span>{row.etf.name}</span>
                    </td>
                    <td data-label="ISIN"><BoursobankIsinLink etf={row.etf} /></td>
                    <td data-label="Dernier prix">{formatCurrency(rowLatestPrice?.closePrice, row.etf.currency)}</td>
                    <td data-label="Dernière donnée">
                      <span
                        className={isStale ? 'data-date data-date-stale' : 'data-date'}
                        title="Date de la dernière donnée de prix importée"
                      >
                        {formatDate(rowLatestPrice?.pricedAt)}
                      </span>
                    </td>
                    <td data-label="Points">{row.prices.length}</td>
                    <td data-label="Actions">
                      <div className="row-actions">
                        <button className="icon-button danger" title="Supprimer" onClick={() => removeRow(row)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel
        title="Classement momentum"
        isOpen={isRankingOpen}
        onToggle={() => setIsRankingOpen((current) => !current)}
        actions={
          <button
            className="icon-button"
            title="Recalculer les scores momentum"
            onClick={() => void refreshDecision()}
            disabled={rows.length === 0 || isRefreshingScores}
          >
            <RefreshCw size={16} className={isRefreshingScores ? 'spin' : undefined} />
          </button>
        }
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rang</th>
                <th>ETF</th>
                <th>Score</th>
                <th>Signal</th>
                <th>Perf 6M</th>
                <th>Perf 12M</th>
                <th>Volatilité</th>
                <th>Stop</th>
                <th>MM200</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((row, index) => (
                <tr key={row.etf.id}>
                  <td data-label="Rang">{index + 1}</td>
                  <td data-label="ETF"><Link to={`/etfs/${row.etf.id}`} className="table-title">{row.etf.symbol}</Link></td>
                  <td data-label="Score">{formatNumber(row.snapshot?.score, 1)}</td>
                  <td data-label="Signal"><SignalBadge signal={row.snapshot?.signal} /></td>
                  <td data-label="Perf 6M">{formatSignedPercent(row.snapshot?.performance6Months)}</td>
                  <td data-label="Perf 12M">{formatSignedPercent(row.snapshot?.performance12Months)}</td>
                  <td data-label="Volatilité">{formatPercent(row.snapshot?.volatilityAnnualized)}</td>
                  <td data-label="Stop">{row.trailingStop.recommended ? `${row.trailingStop.recommended.percentage}%` : '-'}</td>
                  <td data-label="MM200">{formatNumber(row.snapshot?.movingAverage200)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsiblePanel>
    </main>
  );
}

function daysSince(date: string): number {
  return Math.abs(Date.now() - new Date(`${date}T00:00:00`).getTime()) / 86_400_000;
}

function latestPriceOf(prices: PricePoint[]): PricePoint | undefined {
  return [...prices].sort((a, b) => a.pricedAt.localeCompare(b.pricedAt)).at(-1);
}

function filterLastMonths(prices: PricePoint[], months: number): PricePoint[] {
  const sorted = [...prices].sort((a, b) => a.pricedAt.localeCompare(b.pricedAt));
  const latest = sorted[sorted.length - 1];
  if (!latest) return [];
  const from = new Date(`${latest.pricedAt}T00:00:00`);
  from.setMonth(from.getMonth() - months);
  return sorted.filter((price) => price.pricedAt >= from.toISOString().slice(0, 10));
}

function looksLikeIsin(value: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{10}$/.test(value.toUpperCase());
}
