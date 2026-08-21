import { useEffect, useRef, useState } from 'react';
import { Columns3, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  EVENTS_COLUMNS,
  useEventsColumnsStore,
  type EventsColumnKey,
} from '@/stores/eventsColumns';
import { useEventsColumnLabels } from './columnLabels';

interface ColumnChooserProps {
  /** Style hint — `classic` renders an outlined zinc button to match the
   *  legacy skin. */
  variant?: 'modern' | 'classic';
}

/**
 * Dropdown that lets operators toggle event-table columns on / off. Mirrors
 * bootstrap-tables' "Columns" button on the legacy ZM events page. Persistence
 * lives in `useEventsColumnsStore` (localStorage) so choices survive reloads.
 */
export function ColumnChooser({ variant = 'modern' }: ColumnChooserProps) {
  const { t } = useTranslation();
  const labels = useEventsColumnLabels();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const hidden = useEventsColumnsStore((s) => s.hidden);
  const toggle = useEventsColumnsStore((s) => s.toggle);
  const showAll = useEventsColumnsStore((s) => s.showAll);
  const resetDefaults = useEventsColumnsStore((s) => s.resetDefaults);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, [open]);

  const isHidden = (key: EventsColumnKey) => hidden.includes(key);
  const visibleCount = EVENTS_COLUMNS.length - hidden.length;

  const buttonCls = variant === 'classic'
    ? 'px-3 py-1.5 rounded border border-zinc-300 bg-white text-sm text-zinc-700 hover:bg-zinc-50 inline-flex items-center gap-1.5'
    : 'px-3 py-2 rounded-lg border border-border-subtle bg-surface text-sm text-text-secondary hover:text-text-primary hover:border-cyan/50 inline-flex items-center gap-1.5 transition-colors';

  const panelCls = variant === 'classic'
    ? 'absolute right-0 top-full mt-1 z-20 w-56 bg-white border border-zinc-300 rounded shadow-lg py-1 text-sm text-zinc-800'
    : 'absolute right-0 top-full mt-1 z-20 w-56 bg-panel border border-border-subtle rounded-lg shadow-xl py-1 text-sm text-text-primary';

  const itemCls = variant === 'classic'
    ? 'flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-zinc-50 cursor-pointer'
    : 'flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-surface cursor-pointer';

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={buttonCls}
      >
        <Columns3 size={14} />
        {t('Columns')}
        <span className={clsx('font-mono text-xs', variant === 'classic' ? 'text-zinc-500' : 'text-text-muted')}>
          ({visibleCount})
        </span>
      </button>
      {open && (
        <div role="menu" className={panelCls}>
          {EVENTS_COLUMNS.map((col) => {
            const visible = !isHidden(col.key);
            return (
              <label key={col.key} className={itemCls}>
                <span>{labels[col.key]}</span>
                <span
                  className={clsx(
                    'inline-flex items-center justify-center w-4 h-4 rounded border',
                    visible
                      ? 'bg-accent border-accent text-accent-fg'
                      : 'border-border bg-surface',
                  )}
                >
                  {visible && <Check size={11} strokeWidth={3} />}
                </span>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={visible}
                  onChange={() => toggle(col.key)}
                  aria-label={t('Toggle column {{column}}', { column: labels[col.key] })}
                />
              </label>
            );
          })}
          <div
            className={clsx(
              'border-t mt-1 pt-1 px-3 flex items-center justify-between gap-2 text-xs',
              variant === 'classic' ? 'border-zinc-200 text-zinc-500' : 'border-border-subtle text-text-muted',
            )}
          >
            <button
              type="button"
              onClick={showAll}
              className={clsx(
                'py-1 hover:underline',
                variant === 'classic' ? 'hover:text-cyan-700' : 'hover:text-cyan',
              )}
            >
              {t('Show all')}
            </button>
            <button
              type="button"
              onClick={resetDefaults}
              className={clsx(
                'py-1 hover:underline',
                variant === 'classic' ? 'hover:text-cyan-700' : 'hover:text-cyan',
              )}
            >
              {t('Defaults')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
