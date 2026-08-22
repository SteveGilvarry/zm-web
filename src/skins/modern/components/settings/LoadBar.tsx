import { clsx } from 'clsx';

/**
 * One CPU / memory / disk reading.
 *
 * The bar is neutral until the number is worth acting on — warn past 70%,
 * danger past 90%. A machine that is fine looks grey (docs/DESIGN.md).
 */
export function LoadBar({ value, label, detail }: { value: number; label: string; detail?: string }) {
  const percent = Math.min(value, 100);
  const critical = percent > 90;
  const warning = !critical && percent > 70;
  const bar = critical ? 'bg-danger' : warning ? 'bg-warn' : 'bg-fg-dim';
  const readout = critical ? 'text-danger' : warning ? 'text-warn' : 'text-fg';

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-fg-muted">{label}</span>
        <span className={clsx('text-sm font-mono tabular-nums', readout)}>{percent.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-border overflow-hidden">
        <div className={clsx('h-full rounded-full', bar)} style={{ width: `${percent}%` }} />
      </div>
      {detail && <p className="text-xs text-fg-dim tabular-nums">{detail}</p>}
    </div>
  );
}
