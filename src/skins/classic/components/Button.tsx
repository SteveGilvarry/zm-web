import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';
import { classicButtonClass, type ClassicButtonSize, type ClassicButtonTone } from './buttonClass';

export interface ClassicButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ClassicButtonTone;
  size?: ClassicButtonSize;
  /** Leading icon (lucide), drawn at 14px by the caller. */
  icon?: ReactNode;
}

/** Legacy ZoneMinder toolbar button: `SCAN NETWORK`, `ADD`, `CLONE`, … */
export function ClassicButton({
  tone = 'default',
  size = 'md',
  icon,
  className,
  children,
  type = 'button',
  ...rest
}: ClassicButtonProps) {
  return (
    <button type={type} className={classicButtonClass(tone, size, className)} {...rest}>
      {icon && <span aria-hidden className="inline-flex leading-none">{icon}</span>}
      {children}
    </button>
  );
}

/**
 * Square icon-only button from the bootstrap-table toolbar (refresh,
 * columns, export). `aria-label` is required: there is no visible text.
 */
export function ClassicIconButton({
  className,
  children,
  'aria-label': ariaLabel,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { 'aria-label': string }) {
  return (
    <button
      type={type}
      aria-label={ariaLabel}
      title={rest.title ?? ariaLabel}
      className={clsx(
        'inline-flex items-center justify-center w-9 h-8 rounded-sm border',
        'bg-[#337ab7] border-[#2e6da4] text-white hover:bg-[#286090] transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#337ab7]',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
