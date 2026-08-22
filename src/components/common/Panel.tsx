import { clsx } from 'clsx';
import type { ReactNode } from 'react';

interface PanelProps {
  children: ReactNode;
  className?: string;
  title?: string;
  icon?: ReactNode;
  action?: ReactNode;
  noPadding?: boolean;
}

export function Panel({
  children,
  className,
  title,
  icon,
  action,
  noPadding,
}: PanelProps) {
  return (
    <div
      className={clsx(
        // No drop shadow: a panel sits on the page, it does not float above
        // it. Elevation is reserved for things that really are on top —
        // dialogs, disclosures, toasts. See docs/DESIGN.md.
        'bg-surface rounded border border-border-subtle relative overflow-hidden',
        className
      )}
    >
      {title && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            {icon && <span className="text-fg-dim">{icon}</span>}
            <h3 className="text-sm font-medium text-fg">{title}</h3>
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={clsx(!noPadding && 'p-4')}>{children}</div>
    </div>
  );
}
