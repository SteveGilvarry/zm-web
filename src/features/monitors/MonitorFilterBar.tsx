import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Filter, X } from 'lucide-react';
import { useMonitorFilterStore } from '@/stores/monitorFilter';
import type { Monitor } from '@/types';
import { useMonitorFilter } from './useMonitorFilter';

/* -------------------------------------------------------------------------- */
/*  Enum option sets                                                          */
/* -------------------------------------------------------------------------- */

// Legacy ZM's `Capturing` / `Analysing` / `Recording` columns are short
// fixed enums. The OpenAPI spec types these as plain strings so we copy
// the legal values from `CapturingMode` / `AnalysingMode` / `RecordingMode`
// in src/types.
const CAPTURING_OPTS = ['None', 'Ondemand', 'Always'] as const;
const ANALYSING_OPTS = ['None', 'Always'] as const;
const RECORDING_OPTS = ['None', 'OnMotion', 'Always'] as const;

// Monitor.type values come from the legacy ZM source-camera-driver list.
// Anything else (newer backend additions) shows up as a freeform string.
const SOURCE_OPTS = ['Local', 'Remote', 'File', 'Ffmpeg', 'Libvlc', 'NVSocket', 'cURL', 'WebSite'] as const;

// "Status" in legacy ZM is a derived boolean: capturing != None ⇒ Active.
const STATUS_OPTS = ['active', 'disabled'] as const;

/**
 * Display labels for the enum wire values above. Mode values get translated;
 * source-driver names (Ffmpeg, Libvlc, …) are product names and stay as-is.
 */
function useEnumLabel(): (value: string) => string {
  const { t } = useTranslation();
  const labels: Record<string, string> = {
    None: t('None'),
    Ondemand: t('Ondemand'),
    Always: t('Always'),
    OnMotion: t('OnMotion'),
    Local: t('Local'),
    Remote: t('Remote'),
    File: t('File'),
    active: t('Active'),
    disabled: t('Disabled'),
  };
  return (value) => labels[value] ?? value;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export interface MonitorFilterBarProps {
  /** The unfiltered monitor list to filter. */
  monitors: Monitor[];
  /** Receives the post-filter monitor list every time selections change. */
  onChange: (filtered: Monitor[]) => void;
  /** Optional className for layout customisation by callers. */
  className?: string;
}

/**
 * Shared multi-select filter bar mounted on Console, Montage, and Montage
 * Review. Mirrors legacy ZM's `_monitor_filters.php` — chips for Group /
 * Capturing / Analysing / Recording / Status / Source / Monitor, each a
 * checkbox dropdown.
 *
 * Selections persist in `useMonitorFilterStore` (sessionStorage) so the
 * three pages share state without an explicit prop drill.
 */
export function MonitorFilterBar({ monitors, onChange, className }: MonitorFilterBarProps) {
  const { t } = useTranslation();
  const enumLabel = useEnumLabel();

  const { filtered, activeCount, groups } = useMonitorFilter(monitors);

  const groupIds   = useMonitorFilterStore((s) => s.groupIds);
  const capturing  = useMonitorFilterStore((s) => s.capturing);
  const analysing  = useMonitorFilterStore((s) => s.analysing);
  const recording  = useMonitorFilterStore((s) => s.recording);
  const status     = useMonitorFilterStore((s) => s.status);
  const source     = useMonitorFilterStore((s) => s.source);
  const monitorIds = useMonitorFilterStore((s) => s.monitorIds);

  const setGroupIds   = useMonitorFilterStore((s) => s.setGroupIds);
  const setCapturing  = useMonitorFilterStore((s) => s.setCapturing);
  const setAnalysing  = useMonitorFilterStore((s) => s.setAnalysing);
  const setRecording  = useMonitorFilterStore((s) => s.setRecording);
  const setStatus     = useMonitorFilterStore((s) => s.setStatus);
  const setSource     = useMonitorFilterStore((s) => s.setSource);
  const setMonitorIds = useMonitorFilterStore((s) => s.setMonitorIds);
  const reset         = useMonitorFilterStore((s) => s.reset);

  // Effect Event so the notification fires on every new `filtered` list but
  // never loops when the parent re-creates `onChange` each render.
  const emitChange = useEffectEvent((list: Monitor[]) => onChange(list));
  useEffect(() => {
    emitChange(filtered);
  }, [filtered]);

  const totalSelected = activeCount;

  return (
    <div
      className={clsx(
        'flex flex-wrap items-center gap-2',
        className,
      )}
      aria-label={t('Monitor filter bar')}
      role="group"
    >
      <Filter size={14} className="text-fg-dim" aria-hidden />

      <Chip
        label={t('Groups')}
        emptyLabel={t('All groups')}
        options={groups.map((g) => ({ value: String(g.id), label: g.name }))}
        selected={groupIds.map(String)}
        onChange={(vals) => setGroupIds(vals.map(Number))}
      />

      <Chip
        label={t('Capturing')}
        emptyLabel={t('Any')}
        options={CAPTURING_OPTS.map((v) => ({ value: v, label: enumLabel(v) }))}
        selected={capturing}
        onChange={setCapturing}
      />

      <Chip
        label={t('Analysing')}
        emptyLabel={t('Any')}
        options={ANALYSING_OPTS.map((v) => ({ value: v, label: enumLabel(v) }))}
        selected={analysing}
        onChange={setAnalysing}
      />

      <Chip
        label={t('Recording')}
        emptyLabel={t('Any')}
        options={RECORDING_OPTS.map((v) => ({ value: v, label: enumLabel(v) }))}
        selected={recording}
        onChange={setRecording}
      />

      <Chip
        label={t('Status')}
        emptyLabel={t('Any')}
        options={STATUS_OPTS.map((v) => ({ value: v, label: enumLabel(v) }))}
        selected={status}
        onChange={setStatus}
      />

      <Chip
        label={t('Source')}
        emptyLabel={t('Any')}
        options={SOURCE_OPTS.map((v) => ({ value: v, label: enumLabel(v) }))}
        selected={source}
        onChange={setSource}
      />

      <Chip
        label={t('Monitor')}
        emptyLabel={t('Any')}
        options={monitors.map((m) => ({ value: String(m.id), label: m.name }))}
        selected={monitorIds.map(String)}
        onChange={(vals) => setMonitorIds(vals.map(Number))}
      />

      {totalSelected > 0 && (
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-border-subtle text-fg-dim hover:border-border hover:text-fg transition-colors"
          aria-label={t('Reset all filters')}
        >
          <X size={11} />
          {t('Reset')}
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Chip — a single multi-select dropdown                                     */
/* -------------------------------------------------------------------------- */

interface ChipOption {
  value: string;
  label: string;
}

interface ChipProps {
  label: string;
  /** Tooltip / placeholder shown when nothing is selected. */
  emptyLabel: string;
  options: ChipOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}

function Chip({ label, emptyLabel, options, selected, onChange }: ChipProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const count = selected.length;
  const summary = count === 0 ? emptyLabel : t('{{count}} selected', { count });

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={count > 0
          ? t('{{label}} filter, {{count}} selected', { label, count })
          : t('{{label}} filter', { label })}
        className={clsx(
          'flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border transition-colors',
          // The accent marks a chip that is *selected*; an untouched chip is
          // grey, hover included (docs/DESIGN.md).
          count > 0
            ? 'border-accent/30 bg-accent/12 text-accent'
            : 'border-border-subtle bg-surface text-fg-muted hover:border-border hover:text-fg',
        )}
      >
        <span className="font-medium">{label}</span>
        {count > 0 && (
          <span
            className="px-1 min-w-[1rem] text-center text-xs font-mono tabular-nums"
            aria-label={t('{{count}} active', { count })}
          >
            {count}
          </span>
        )}
        {count === 0 && (
          <span className="text-fg-dim italic">{summary}</span>
        )}
        <ChevronDown size={12} className={clsx('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t('{{label}} options', { label })}
          aria-multiselectable="true"
          className="absolute start-0 top-full mt-1 z-40 w-56 max-h-80 overflow-y-auto rounded border border-border bg-surface shadow-elevated p-1"
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs italic text-fg-dim">
              {t('No options')}
            </div>
          ) : (
            <ul className="space-y-0.5">
              {options.map((opt) => {
                const checked = selected.includes(opt.value);
                return (
                  <li key={opt.value}>
                    <label
                      className={clsx(
                        'flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs',
                        'hover:bg-surface-2',
                        checked ? 'text-accent' : 'text-fg-muted',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(opt.value)}
                        className="accent-accent"
                        aria-label={opt.label}
                      />
                      <span className="flex-1 truncate">{opt.label}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {count > 0 && (
            <div className="border-t border-border-subtle mt-1 pt-1">
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full text-start px-2 py-1 text-xs text-fg-dim hover:text-fg transition-colors"
              >
                {t('Clear {{label}}', { label: label.toLocaleLowerCase() })}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
