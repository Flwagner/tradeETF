import { useEffect, useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { Disclaimer } from '../components/Disclaimer';
import { PriceSparkline } from '../components/PriceSparkline';
import { Stat } from '../components/Stat';
import { runTacticalBacktest } from '../domain/backtest';
import { formatCurrency, formatNumber, formatPercent, formatSignedPercent } from '../domain/format';
import { loadEtfData } from '../services/appData';
import type { BacktestSettings, EtfWithData, PricePoint } from '../types';

export function BacktestPage() {
  const [rows, setRows] = useState<EtfWithData[]>([]);
  const [period, setPeriod] = useState<BacktestSettings['period']>('1y');
  const [stopLossPercent, setStopLossPercent] = useState(10);
  const [status, setStatus] = useState('Chargement...');

  useEffect(() => {
    loadEtfData()
      .then((data) => {
        setRows(data);
        setStatus(`${data.length} ETF disponibles.`);
      })
      .catch((error: Error) => setStatus(error.message));
  }, []);

  const result = useMemo(
    () =>
      runTacticalBacktest(
        rows.map((row) => ({ etf: row.etf, prices: row.prices })),
        { period, stopLossPercent, initialCapital: 1000 },
      ),
    [rows, period, stopLossPercent],
  );

  return (
    <main className="page">
      <section className="panel detail-header">
        <div>
          <span className="muted">tradeETF · Backtest tactique</span>
          <h1>Rotation tactique</h1>
          <p>
            Achat du meilleur score momentum quand le portefeuille est en cash ; sortie au stop loss ; nouvelle
            sélection ensuite.
          </p>
        </div>
        <Play size={30} className="header-icon" />
      </section>

      <section className="panel">
        <div className="panel-heading">
          <span>Paramètres</span>
          <small>{status}</small>
        </div>
        <div className="form-row">
          <label>
            Période
            <select value={period} onChange={(event) => setPeriod(event.target.value as BacktestSettings['period'])}>
              <option value="1y">1 an</option>
              <option value="6m">6 mois</option>
              <option value="3m">3 mois</option>
            </select>
          </label>
          <label>
            Stop loss: {stopLossPercent}%
            <input
              type="range"
              min="1"
              max="25"
              value={stopLossPercent}
              onChange={(event) => setStopLossPercent(Number(event.target.value))}
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading"><span>Résumé</span></div>
        <div className="stat-grid wide">
          <Stat label="Capital final" value={formatCurrency(result.summary.finalValue)} tone={result.summary.returnPercent >= 0 ? 'success' : 'danger'} />
          <Stat label="Performance" value={formatSignedPercent(result.summary.returnPercent)} tone={result.summary.returnPercent >= 0 ? 'success' : 'danger'} />
          <Stat label="Max drawdown" value={formatPercent(result.summary.maxDrawdown)} />
          <Stat label="Trades fermés" value={result.summary.tradeCount} />
          <Stat label="Taux de réussite" value={formatPercent(result.summary.winRate)} />
          <Stat label="Gain moyen/trade" value={formatSignedPercent(result.summary.averageTradeReturn)} />
        </div>
        <EquityCurve curve={result.equityCurve} />
      </section>

      {result.openPosition ? (
        <section className="panel">
          <div className="panel-heading"><span>Position ouverte simulée</span></div>
          <div className="stat-grid wide">
            <Stat label="ETF" value={result.openPosition.symbol} />
            <Stat label="Entrée" value={result.openPosition.entryDate} />
            <Stat label="Prix entrée" value={formatCurrency(result.openPosition.entryPrice)} />
            <Stat label="Stop" value={formatCurrency(result.openPosition.stopPrice)} />
            <Stat label="Score entrée" value={formatNumber(result.openPosition.entryScore, 1)} />
            <Stat label="Valeur courante" value={formatCurrency(result.openPosition.currentValue)} />
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-heading"><span>Trades fermés</span></div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ETF</th>
                <th>Entrée</th>
                <th>Sortie</th>
                <th>Prix entrée</th>
                <th>Prix sortie</th>
                <th>Stop</th>
                <th>Score</th>
                <th>Performance</th>
                <th>Capital après sortie</th>
              </tr>
            </thead>
            <tbody>
              {result.trades.map((trade, index) => (
                <tr key={`${trade.etfId}-${trade.entryDate}-${index}`}>
                  <td>{trade.symbol}</td>
                  <td>{trade.entryDate}</td>
                  <td>{trade.exitDate}</td>
                  <td>{formatCurrency(trade.entryPrice)}</td>
                  <td>{formatCurrency(trade.exitPrice)}</td>
                  <td>{formatCurrency(trade.stopPrice)}</td>
                  <td>{formatNumber(trade.entryScore, 1)}</td>
                  <td>{formatSignedPercent(trade.returnPercent)}</td>
                  <td>{formatCurrency(trade.capitalAfterExit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Disclaimer />
    </main>
  );
}

function EquityCurve({ curve }: { curve: Array<{ date: string; value: number }> }) {
  const points: PricePoint[] = curve.map((point) => ({
    etfId: 'equity',
    pricedAt: point.date,
    openPrice: null,
    highPrice: point.value,
    lowPrice: point.value,
    closePrice: point.value,
    adjustedClosePrice: point.value,
    volume: null,
    source: 'backtest',
  }));
  return <PriceSparkline prices={points} height={220} />;
}
