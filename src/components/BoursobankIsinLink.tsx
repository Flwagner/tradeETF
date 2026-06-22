import { ExternalLink } from 'lucide-react';
import { boursobankEtfUrl } from '../domain/boursobank';
import type { ETF } from '../types';

export function BoursobankIsinLink({
  etf,
  className,
}: {
  etf: Pick<ETF, 'isin' | 'boursoIdentifier'>;
  className?: string;
}) {
  const href = boursobankEtfUrl(etf);

  if (!href) {
    return <span className={className}>{etf.isin}</span>;
  }

  return (
    <a
      className={['isin-link', className].filter(Boolean).join(' ')}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Ouvrir ${etf.isin} sur Boursobank`}
      title="Ouvrir sur Boursobank"
    >
      <span>{etf.isin}</span>
      <ExternalLink size={13} aria-hidden="true" />
    </a>
  );
}
