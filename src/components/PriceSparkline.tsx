import type { PricePoint } from '../types';
import { metricClose, sortPrices } from '../domain/momentum';

export function PriceSparkline({
  prices,
  height = 140,
  stopPrice,
}: {
  prices: PricePoint[];
  height?: number;
  stopPrice?: number | null;
}) {
  const sorted = sortPrices(prices).slice(-180);
  if (sorted.length < 2) {
    return <div className="empty-chart">Pas assez de prix</div>;
  }

  const values = sorted.map(metricClose);
  const min = Math.min(...values, stopPrice ?? Infinity);
  const max = Math.max(...values, stopPrice ?? -Infinity);
  const range = max - min || 1;
  const width = 900;
  const padding = 12;
  const points = values
    .map((value, index) => {
      const x = padding + (index / (values.length - 1)) * (width - padding * 2);
      const y = padding + (1 - (value - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');
  const stopY =
    stopPrice === null || stopPrice === undefined
      ? null
      : padding + (1 - (stopPrice - min) / range) * (height - padding * 2);

  return (
    <svg className="price-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Graphique de prix">
      <defs>
        <linearGradient id="priceFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#13a38b" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#13a38b" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polyline points={`${padding},${height - padding} ${points} ${width - padding},${height - padding}`} fill="url(#priceFill)" stroke="none" />
      <polyline points={points} fill="none" stroke="#0b8f7b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {stopY !== null ? (
        <line x1={padding} x2={width - padding} y1={stopY} y2={stopY} stroke="#d84b4b" strokeWidth="2" strokeDasharray="8 7" />
      ) : null}
    </svg>
  );
}
