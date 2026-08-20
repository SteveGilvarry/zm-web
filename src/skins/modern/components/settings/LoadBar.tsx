import { clsx } from 'clsx';

export function LoadBar({ value, label, detail }: { value: number; label: string; detail?: string }) {
  const percent = Math.min(value, 100);
  const color = percent > 90 ? 'bg-crimson' : percent > 70 ? 'bg-amber' : 'bg-cyan';
  const textColor = percent > 90 ? 'text-crimson' : percent > 70 ? 'text-amber' : 'text-text-secondary';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-secondary">{label}</span>
        <span className={clsx('text-sm font-mono', textColor)}>{percent.toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded-full bg-border overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-slow', color)}
          style={{ width: `${percent}%` }}
        />
      </div>
      {detail && <p className="text-xs text-text-muted">{detail}</p>}
    </div>
  );
}
