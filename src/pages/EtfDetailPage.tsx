import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Disclaimer } from '../components/Disclaimer';
import { PriceSparkline } from '../components/PriceSparkline';
import { SignalBadge } from '../components/SignalBadge';
import { Stat } from '../components/Stat';
import { formatCurrency, formatDate, formatNumber, formatPercent, formatSignedPercent } from '../domain/format';
import { metricClose, sortPrices } from '../domain/momentum';
import { loadEtfData } from '../services/appData';
import type { EtfWithData, PricePoint } from '../types';

type Period = '1y' | '6m' | '3m' | '1m';

const PERIOD_DAYS: Record<Period, number> = {
  '1y': 365,
  '6m': 183,
  '3m': 92,
  '1m': 31,
};

export function EtfDetailPage() {
  const { id } = useParams();
  const [row, setRow] = useState<EtfWithData | null>(null);
  const [status, setStatus] = useState('Chargement...');
  const [period, setPeriod] = useState<Period>('6m');

  useEffect(() => {
    loadEtfData()
      .then((rows) => {
        const found = rows.find((item) => item.etf.id === id) ?? null;
        setRow(found);
        setStatus(found ? 'Données chargées.' : 'ETF introuvable.');
      })
      .catch((error: Error) => setStatus(error.message));
  }, [id]);

  const visiblePrices = useMemo(() => filterPeriod(row?.prices ?? [], period), [row, period]);
  const periodStats = useMemo(() => summarizePrices(visiblePrices), [visiblePrices]);

  if (!row) {
    return (
      <main className="page">
        <Link to="/" className="back-link"><ArrowLeft size={16} /> Retour</Link>
        <section className="panel"><p>{status}</p></section>
      </main>
    );
  }

  const snapshot = row.snapshot;
  const latest = row.prices[row.prices.length - 1];
  const stop = row.trailingStop.recommended;
  const components = snapshot?.details.components ?? {};

  return (
    <main className="page">
      <Link to="/" className="back-link"><ArrowLeft size={16} /> Retour</Link>
      <section className="panel detail-header">
        <div>
          <span className="muted">{row.etf.isin}</span>
          <h1>{row.etf.symbol} · {row.etf.name}</h1>
        </div>
        <div className="header-metrics">
          <Stat label="Score" value={formatNumber(snapshot?.score, 1)} tone={snapshot?.signal === 'buy' ? 'success' : 'warning'} />
          <Stat label="Signal" value={<SignalBadge signal={snapshot?.signal} />} />
          <Stat label="Dernier prix" value={formatCurrency(latest?.closePrice, row.etf.currency)} />
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <span>Prix</span>
          <div className="segmented compact">
            {(['1y', '6m', '3m', '1m'] as Period[]).map((value) => (
              <button key={value} className={period === value ? 'active' : ''} onClick={() => setPeriod(value)}>
                {value}
              </button>
            ))}
          </div>
        </div>
        <PriceSparkline
          prices={visiblePrices}
          height={230}
          stopPrice={stop?.stopPrice}
          stopPercent={stop?.percentage}
          currency={row.etf.currency}
          interactive
          maxPoints={370}
        />
        <div className="stat-grid wide">
          <Stat label="Performance période" value={formatSignedPercent(periodStats.performance)} />
          <Stat label="Plus bas" value={formatCurrency(periodStats.low, row.etf.currency)} />
          <Stat label="Plus haut" value={formatCurrency(periodStats.high, row.etf.currency)} />
          <Stat label="Points" value={visiblePrices.length} />
        </div>
      </section>

      <section className="detail-grid">
        <div className="panel">
          <div className="panel-heading"><span>Identité</span></div>
          <dl className="definition-list">
            <dt>ISIN</dt><dd>{row.etf.isin}</dd>
            <dt>Place</dt><dd>{row.etf.exchange}</dd>
            <dt>Devise</dt><dd>{row.etf.currency}</dd>
            <dt>Symbole fournisseur</dt><dd>{row.etf.dataProviderSymbol ?? '-'}</dd>
            <dt>Points de prix</dt><dd>{row.prices.length}</dd>
            <dt>Dernière séance</dt><dd>{formatDate(latest?.pricedAt)}</dd>
          </dl>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <span>Trailing stop hebdo</span>
            <RefreshCw size={17} />
          </div>
          {row.trailingStop.available && stop ? (
            <>
              <div className="stat-grid">
                <Stat label="Stop conseillé" value={`${stop.percentage}%`} tone="warning" />
                <Stat label="Ordre de vente" value={formatCurrency(stop.stopPrice, row.etf.currency)} />
                <Stat label="Prix utilisé" value={formatCurrency(row.trailingStop.latestClose, row.etf.currency)} />
                <Stat label="Reventes visées" value="≤ 45%" />
              </div>
              <p className="muted">Mise à jour hebdomadaire, avec simulation d’entrées tous les 5 points de cotation.</p>
              <CandidateTable row={row} />
            </>
          ) : (
            <p>{row.trailingStop.message ?? 'historique insuffisant'}</p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading"><span>Calcul momentum</span></div>
        <div className="stat-grid wide">
          <Stat label="Perf 1M" value={formatSignedPercent(snapshot?.performance1Month)} />
          <Stat label="Perf 3M" value={formatSignedPercent(snapshot?.performance3Months)} />
          <Stat label="Perf 6M" value={formatSignedPercent(snapshot?.performance6Months)} />
          <Stat label="Perf 12M" value={formatSignedPercent(snapshot?.performance12Months)} />
          <Stat label="Vol annualisée" value={formatPercent(snapshot?.volatilityAnnualized)} />
          <Stat label="Max drawdown" value={formatPercent(snapshot?.maxDrawdown)} />
          <Stat label="MM50" value={formatNumber(snapshot?.movingAverage50)} />
          <Stat label="MM200" value={formatNumber(snapshot?.movingAverage200)} />
          <Stat label="Distance MM200" value={formatSignedPercent(snapshot?.distanceToMovingAverage200)} />
          <Stat label="ATR14" value={formatNumber(snapshot?.atr14)} />
          <Stat label="Prix ajusté utilisé" value={formatCurrency(snapshot?.details.latest_metric_close, row.etf.currency)} />
          <Stat label="Historique suffisant" value={snapshot?.details.enough_history ? 'Oui' : 'Non'} tone={snapshot?.details.enough_history ? 'success' : 'warning'} />
        </div>
        <div className="component-grid">
          {Object.entries(components).map(([key, value]) => (
            <div key={key}>
              <span>{key.replace(/_/g, ' ')}</span>
              <strong>{formatNumber(value, 1)}</strong>
            </div>
          ))}
        </div>
      </section>
      <Disclaimer />
    </main>
  );
}

function CandidateTable({ row }: { row: EtfWithData }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Stop</th>
            <th>Prix</th>
            <th>Trades</th>
            <th>Moyenne</th>
            <th>Pire</th>
            <th>Meilleur</th>
            <th>Win rate</th>
            <th>Stop hit</th>
            <th>Score ajusté</th>
          </tr>
        </thead>
        <tbody>
          {row.trailingStop.candidates.map((candidate) => (
            <tr key={candidate.percentage}>
              <td data-label="Stop">{candidate.percentage}%</td>
              <td data-label="Prix">{formatCurrency(candidate.stopPrice, row.etf.currency)}</td>
              <td data-label="Trades">{candidate.trades}</td>
              <td data-label="Moyenne">{formatNumber(candidate.averageReturn, 2)}%</td>
              <td data-label="Pire">{formatNumber(candidate.worstReturn, 2)}%</td>
              <td data-label="Meilleur">{formatNumber(candidate.bestReturn, 2)}%</td>
              <td data-label="Win rate">{formatNumber(candidate.winRate, 1)}%</td>
              <td data-label="Stop hit">{formatNumber(candidate.stopHitRate, 1)}%</td>
              <td data-label="Score ajusté">{formatNumber(candidate.riskAdjustedScore, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function filterPeriod(prices: PricePoint[], period: Period): PricePoint[] {
  const sorted = sortPrices(prices);
  const latest = sorted[sorted.length - 1];
  if (!latest) return [];
  const from = new Date(`${latest.pricedAt}T00:00:00`);
  from.setDate(from.getDate() - PERIOD_DAYS[period]);
  return sorted.filter((price) => price.pricedAt >= from.toISOString().slice(0, 10));
}

function summarizePrices(prices: PricePoint[]) {
  if (prices.length < 2) return { performance: null, low: null, high: null };
  const values = prices.map(metricClose);
  return {
    performance: values[values.length - 1] / values[0] - 1,
    low: Math.min(...values),
    high: Math.max(...values),
  };
}
