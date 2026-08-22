import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';

/**
 * A toolbar button that opens a panel beneath the toolbar.
 *
 * Controls an operator reaches for occasionally — the full filter set, the
 * system detail — used to sit permanently on screen, which is how a page
 * about cameras ended up two thirds chrome (docs/DESIGN.md). This puts them
 * one click away and closes on outside-click or Escape, so a page that is
 * mostly video never gets trapped behind an open panel.
 */
export function ToolbarDisclosure({
  label,
  icon: Icon,
  count = 0,
  children,
  align = 'start',
  className,
}: {
  label: string;
  icon?: LucideIcon;
  /** Shown beside the label and marks the button active; 0 hides it. */
  count?: number;
  children: ReactNode;
  align?: 'start' | 'end';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className={clsx('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={clsx(
          'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
          count > 0 || open ? 'bg-accent/15 text-accent' : 'text-fg-dim hover:text-fg',
        )}
      >
        {Icon && <Icon size={12} aria-hidden />}
        {label}
        {count > 0 && <span className="font-mono tabular-nums">{count}</span>}
      </button>

      {open && (
        <div
          id={panelId}
          className={clsx(
            'absolute top-full mt-1 z-40 min-w-[22rem] max-h-[70vh] overflow-auto',
            'rounded border border-border bg-surface shadow-[var(--elevation-2)] p-4',
            align === 'end' ? 'end-0' : 'start-0',
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
