import { clsx } from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Whether this chip is the active choice. Announced as `aria-pressed`. */
  selected?: boolean;
  children: ReactNode;
}

/**
 * Toggleable filter pill (the "last hour / today / all" row, tag chips).
 * A real toggle button, so its state is announced rather than implied by
 * colour alone.
 */
export function Chip({ selected = false, className, type = 'button', children, ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-label font-medium transition-colors',
        selected
          ? 'bg-accent/15 border-accent/40 text-accent'
          : 'bg-surface-2 border-border-subtle text-fg-dim hover:text-fg hover:border-border',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
