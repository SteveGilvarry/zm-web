import { clsx } from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';
import { toneTint, type Tone } from './styles';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  children: ReactNode;
}

/**
 * Static status pill — "RUNNING", "Archived", an event count. Read-only; use
 * `Chip` for anything the operator can click.
 */
export function Badge({ tone = 'neutral', className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-label font-medium',
        toneTint[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
