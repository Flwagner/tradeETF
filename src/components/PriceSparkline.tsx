import { useId, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { PricePoint } from '../types';
import { metricClose, sortPrices } from '../domain/momentum';
import { formatCurrency, formatDate } from '../domain/format';

export function PriceSparkline({
  prices,
  height = 140,
  stopPrice,
  stopPercent,
  currency = 'EUR',
  interactive = false,
  maxPoints = 180,
}: {
  prices: PricePoint[];
  height?: number;
  stopPrice?: number | null;
  stopPercent?: number | null;
  currency?: string;
  interactive?: boolean;
  maxPoints?: number;
}) {
  const gradientId = useId();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const sorted = useMemo(() => sortPrices(prices).slice(-maxPoints), [maxPoints, prices]);
  if (sorted.length < 2) {
    return <div className="empty-chart">Pas assez de prix</div>;
  }

  const values = sorted.map(metricClose);
  const min = Math.min(...values, stopPrice ?? Infinity);
  const max = Math.max(...values, stopPrice ?? -Infinity);
  const range = max - min || 1;
  const width = 900;
  const padding = 12;
  const chartPoints = values.map((value, index) => {
      const x = padding + (index / (values.length - 1)) * (width - padding * 2);
      const y = padding + (1 - (value - min) / range) * (height - padding * 2);
      return { x, y, value, price: sorted[index] };
    });
  const points = chartPoints.map((point) => `${point.x},${point.y}`).join(' ');
  const areaPoints = `${padding},${height - padding} ${points} ${width - padding},${height - padding}`;
  const stopY =
    stopPrice === null || stopPrice === undefined
      ? null
      : padding + (1 - (stopPrice - min) / range) * (height - padding * 2);
  const activePoint = activeIndex === null ? null : chartPoints[activeIndex] ?? null;
  const latestPoint = chartPoints[chartPoints.length - 1];
  const performance = values[values.length - 1] / values[0] - 1;
  const tooltipLeft = activePoint ? Math.min(94, Math.max(6, (activePoint.x / width) * 100)) : 0;

  return (
    <div className={interactive ? 'chart-shell interactive' : 'chart-shell'}>
      <svg
        ref={svgRef}
        className="price-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Graphique de prix"
        onPointerLeave={() => setActiveIndex(null)}
        onPointerMove={interactive ? handlePointerMove : undefined}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-accent)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--chart-accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={ratio}
            x1={padding}
            x2={width - padding}
            y1={padding + ratio * (height - padding * 2)}
            y2={padding + ratio * (height - padding * 2)}
            className="chart-grid-line"
          />
        ))}
        <polyline points={areaPoints} fill={`url(#${gradientId})`} stroke="none" />
        <polyline points={points} fill="none" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {stopY !== null ? (
          <>
            <line x1={padding} x2={width - padding} y1={stopY} y2={stopY} className="chart-stop-line" />
            <g className="chart-stop-label" transform={`translate(${padding + 8} ${Math.max(24, stopY - 10)})`}>
              <rect width="154" height="24" rx="5" />
              <text x="10" y="16">
                Stop {stopPercent ? `${stopPercent}% · ` : ''}
                {formatCurrency(stopPrice, currency)}
              </text>
            </g>
          </>
        ) : null}
        {latestPoint ? <circle cx={latestPoint.x} cy={latestPoint.y} r="4.5" className="chart-latest-point" /> : null}
        {activePoint && interactive ? (
          <>
            <line x1={activePoint.x} x2={activePoint.x} y1={padding} y2={height - padding} className="chart-crosshair" />
            <line x1={padding} x2={width - padding} y1={activePoint.y} y2={activePoint.y} className="chart-crosshair" />
            <circle cx={activePoint.x} cy={activePoint.y} r="6" className="chart-active-point" />
          </>
        ) : null}
      </svg>
      {activePoint && interactive ? (
        <div
          className="chart-tooltip"
          style={{
            left: `${tooltipLeft}%`,
            top: `${(activePoint.y / height) * 100}%`,
          }}
        >
          <span>{formatDate(activePoint.price.pricedAt)}</span>
          <strong>{formatCurrency(activePoint.value, currency)}</strong>
        </div>
      ) : null}
      {interactive ? (
        <div className="chart-meta">
          <span>{formatDate(sorted[0].pricedAt)}</span>
          <strong className={performance >= 0 ? 'positive' : 'negative'}>
            {performance >= 0 ? '+' : ''}
            {(performance * 100).toFixed(1)}%
          </strong>
          <span>{formatDate(sorted[sorted.length - 1].pricedAt)}</span>
        </div>
      ) : null}
    </div>
  );

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relativeX = ((event.clientX - rect.left) / rect.width) * width;
    const ratio = (relativeX - padding) / (width - padding * 2);
    const index = Math.round(Math.min(1, Math.max(0, ratio)) * (chartPoints.length - 1));
    setActiveIndex(index);
  }
}
