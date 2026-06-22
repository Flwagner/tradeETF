import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

type CollapsiblePanelProps = {
  actions?: ReactNode;
  children: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  title: ReactNode;
};

export function CollapsiblePanel({ actions, children, isOpen, onToggle, title }: CollapsiblePanelProps) {
  return (
    <section className={isOpen ? 'panel collapsible-panel' : 'panel collapsible-panel is-collapsed'}>
      <div className="panel-heading collapsible-heading">
        <button
          className="collapse-toggle"
          type="button"
          aria-expanded={isOpen}
          onClick={onToggle}
          title={isOpen ? 'Replier la section' : 'Déplier la section'}
        >
          <ChevronDown size={17} aria-hidden="true" />
          <span>{title}</span>
        </button>
        {actions ? <div className="heading-actions">{actions}</div> : null}
      </div>
      {isOpen ? children : null}
    </section>
  );
}
