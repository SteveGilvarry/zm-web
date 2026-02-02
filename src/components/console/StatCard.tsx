import { clsx } from 'clsx';
import type { ReactNode } from 'react';

type Variant = 'default' | 'cyan' | 'amber' | 'crimson' | 'emerald';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  variant?: Variant;
  trend?: {
    value: number;
    label: string;
  };
  subtitle?: string;
}

const variantStyles: Record<Variant, { bg: string; text: string; glow: string }> = {
  default: {
    bg: 'bg-panel',
    text: 'text-text-primary',
    glow: '',
  },
  cyan: {
    bg: 'bg-cyan/10',
    text: 'text-cyan',
    glow: 'shadow-[inset_0_0_20px_rgba(0,212,255,0.1)]',
  },
  amber: {
    bg: 'bg-amber/10',
    text: 'text-amber',
    glow: 'shadow-[inset_0_0_20px_rgba(255,176,0,0.1)]',
  },
  crimson: {
    bg: 'bg-crimson/10',
    text: 'text-crimson',
    glow: 'shadow-[inset_0_0_20px_rgba(255,51,102,0.1)]',
  },
  emerald: {
    bg: 'bg-emerald/10',
    text: 'text-emerald',
    glow: 'shadow-[inset_0_0_20px_rgba(0,255,157,0.1)]',
  },
};

export function StatCard({
  label,
  value,
  icon,
  variant = 'default',
  trend,
  subtitle,
}: StatCardProps) {
  const styles = variantStyles[variant];

  return (
    <div
      className={clsx(
        'relative rounded-xl border border-border-subtle p-4',
        'transition-all duration-base',
        'hover:border-border hover:scale-[1.02]',
        styles.bg,
        styles.glow
      )}
    >
      {/* Background decoration */}
      {variant !== 'default' && (
        <div
          className={clsx(
            'absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl opacity-20',
            variant === 'cyan' && 'bg-cyan',
            variant === 'amber' && 'bg-amber',
            variant === 'crimson' && 'bg-crimson',
            variant === 'emerald' && 'bg-emerald'
          )}
        />
      )}

      <div className="relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
            {label}
          </span>
          {icon && (
            <span className={clsx('opacity-60', styles.text)}>{icon}</span>
          )}
        </div>

        {/* Value */}
        <div className={clsx('text-3xl font-bold font-mono tabular-nums', styles.text)}>
          {value}
        </div>

        {/* Trend or subtitle */}
        {trend && (
          <div className="mt-2 flex items-center gap-1">
            <span
              className={clsx(
                'text-xs font-medium',
                trend.value >= 0 ? 'text-emerald' : 'text-crimson'
              )}
            >
              {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}%
            </span>
            <span className="text-xs text-text-muted">{trend.label}</span>
          </div>
        )}

        {subtitle && (
          <div className="mt-1 text-xs text-text-muted">{subtitle}</div>
        )}
      </div>
    </div>
  );
}
