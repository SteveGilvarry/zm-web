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
        'bg-surface rounded-xl border border-border-subtle',
        'shadow-panel relative overflow-hidden',
        className
      )}
    >
      {title && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            {icon && <span className="text-text-muted">{icon}</span>}
            <h3 className="font-medium text-text-primary">{title}</h3>
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={clsx(!noPadding && 'p-4')}>{children}</div>
    </div>
  );
}
