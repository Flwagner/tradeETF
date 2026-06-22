import type { ReactNode } from 'react';

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'success' | 'danger' | 'warning' }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
