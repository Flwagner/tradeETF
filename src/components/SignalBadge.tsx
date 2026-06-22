import type { Signal } from '../types';

export function SignalBadge({ signal }: { signal: Signal | null | undefined }) {
  const value = signal ?? 'watch';
  return <span className={`signal signal-${value}`}>{value}</span>;
}
