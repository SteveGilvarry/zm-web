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

/** A table other than the events list, with its own column state. */
export interface ColumnChooserSource {
  columns: EventsColumnKey[];
  hidden: EventsColumnKey[];
  toggle: (key: EventsColumnKey) => void;
  showAll: () => void;
  /** Defaults; omitted when the table's default is "all". */
  resetDefaults?: () => void;
}

interface ColumnChooserProps {
  /** Style hint — `classic` renders an outlined zinc button to match the
   *  legacy skin. */
  variant?: 'modern' | 'classic';
  /** Drive another table's columns instead of the events list store. */
  source?: ColumnChooserSource;
}

/**
 * Dropdown that lets operators toggle event-table columns on / off. Mirrors
 * bootstrap-tables' "Columns" button on the legacy ZM events page. Persistence
 * lives in `useEventsColumnsStore` (localStorage) so choices survive reloads.
 */
export function ColumnChooser({ variant = 'modern', source }: ColumnChooserProps) {
  const { t } = useTranslation();
  const labels = useEventsColumnLabels();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const storeHidden = useEventsColumnsStore((s) => s.hidden);
  const storeToggle = useEventsColumnsStore((s) => s.toggle);
  const storeShowAll = useEventsColumnsStore((s) => s.showAll);
  const storeReset = useEventsColumnsStore((s) => s.resetDefaults);
  const keys = source ? source.columns : EVENTS_COLUMNS.map((c) => c.key);
  const hidden = source ? source.hidden : storeHidden;
  const toggle = source ? source.toggle : storeToggle;
  const showAll = source ? source.showAll : storeShowAll;
  const resetDefaults = source ? source.resetDefaults : storeReset;

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, [open]);

  const isHidden = (key: EventsColumnKey) => hidden.includes(key);
  const visibleCount = keys.filter((k) => !hidden.includes(k)).length;

  const buttonCls = variant === 'classic'
    ? 'px-3 py-1.5 rounded border border-zinc-300 bg-white text-sm text-zinc-700 hover:bg-zinc-50 inline-flex items-center gap-1.5'
    : 'px-2 py-1.5 rounded border border-border-subtle bg-surface text-xs text-fg-muted hover:text-fg hover:border-border inline-flex items-center gap-1.5 transition-colors';

  const panelCls = variant === 'classic'
    ? 'absolute right-0 top-full mt-1 z-20 w-56 bg-white border border-zinc-300 rounded shadow-lg py-1 text-sm text-zinc-800'
    : 'absolute end-0 top-full mt-1 z-20 w-56 bg-surface border border-border rounded shadow-[var(--elevation-2)] py-1 text-sm text-fg';

  const itemCls = variant === 'classic'
    ? 'flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-zinc-50 cursor-pointer'
    : 'flex items-center justify-between gap-2 px-3 py-1 hover:bg-surface-2 cursor-pointer';

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={buttonCls}
      >
        <Columns3 size={12} />
        {t('Columns')}
        <span className={clsx('font-mono tabular-nums text-xs', variant === 'classic' ? 'text-zinc-500' : 'text-fg-dim')}>
          ({visibleCount})
        </span>
      </button>
      {open && (
        <div role="menu" className={panelCls}>
          {keys.map((key) => {
            const visible = !isHidden(key);
            return (
              <label key={key} className={itemCls}>
                <span>{labels[key]}</span>
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
                  onChange={() => toggle(key)}
                  aria-label={t('Toggle column {{column}}', { column: labels[key] })}
                />
              </label>
            );
          })}
          <div
            className={clsx(
              'border-t mt-1 pt-1 px-3 flex items-center justify-between gap-2 text-xs',
              variant === 'classic' ? 'border-zinc-200 text-zinc-500' : 'border-border-subtle text-fg-dim',
            )}
          >
            <button
              type="button"
              onClick={showAll}
              className={clsx(
                'py-1 hover:underline',
                variant === 'classic' ? 'hover:text-cyan-700' : 'hover:text-fg',
              )}
            >
              {t('Show all')}
            </button>
            {resetDefaults && (
              <button
                type="button"
                onClick={resetDefaults}
                className={clsx(
                  'py-1 hover:underline',
                  variant === 'classic' ? 'hover:text-cyan-700' : 'hover:text-fg',
                )}
              >
                {t('Defaults')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
