import type { HTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';

interface ClassicToolbarProps extends HTMLAttributes<HTMLDivElement> {
  /** Accessible name for the toolbar landmark. */
  label: string;
  /** Controls pushed to the inline end (bootstrap-table's refresh/columns/export). */
  end?: ReactNode;
}

/** Horizontal verb row: `[SCAN NETWORK] [ADD] [CLONE] …` with an end cluster. */
export function ClassicToolbar({ label, end, className, children, ...rest }: ClassicToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      className={clsx('flex flex-wrap items-center gap-2 py-2', className)}
      {...rest}
    >
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">{children}</div>
      {end && <div className="flex flex-wrap items-center gap-2 ms-auto">{end}</div>}
    </div>
  );
}
