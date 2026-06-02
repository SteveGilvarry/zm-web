import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { ChevronDown, Filter, X } from 'lucide-react';
import {
  listGroups,
  listGroupMonitors,
  type Group,
  type GroupMonitor,
} from '@/api/groups';
import { useAuthStore } from '@/stores/auth';
import { useMonitorFilterStore } from '@/stores/monitorFilter';
import type { Monitor } from '@/types';

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
const STATUS_OPTS: ReadonlyArray<{ value: 'active' | 'disabled'; label: string }> = [
  { value: 'active',   label: 'Active' },
  { value: 'disabled', label: 'Disabled' },
] as const;

/* -------------------------------------------------------------------------- */
/*  Filter logic — exported for unit tests                                    */
/* -------------------------------------------------------------------------- */

export interface MonitorFilterSelections {
  groupIds: number[];
  capturing: string[];
  analysing: string[];
  recording: string[];
  status: string[];
  source: string[];
  monitorIds: number[];
}

/**
 * Apply every chip's selections to the monitor list. Selections within a
 * chip OR-combine (e.g. Capturing: Always OR OnAlarm); different chips
 * AND-combine (Group X AND Capturing Always). An empty chip means "no
 * filter from that chip" — every monitor passes that gate.
 */
export function filterMonitors(
  monitors: Monitor[],
  selections: MonitorFilterSelections,
  /** Map of group id → monitor ids in that group. */
  groupMembership: Map<number, Set<number>>,
): Monitor[] {
  const {
    groupIds, capturing, analysing, recording, status, source, monitorIds,
  } = selections;

  // Pre-compute the set of monitor ids reachable through the selected groups.
  // Empty groupIds ⇒ all monitors pass.
  const groupGate: Set<number> | null =
    groupIds.length === 0
      ? null
      : groupIds.reduce<Set<number>>((acc, gid) => {
          const ids = groupMembership.get(gid);
          if (ids) ids.forEach((id) => acc.add(id));
          return acc;
        }, new Set<number>());

  return monitors.filter((m) => {
    if (groupGate && !groupGate.has(m.id))                         return false;
    if (capturing.length && !capturing.includes(m.capturing))      return false;
    if (analysing.length && !analysing.includes(m.analysing))      return false;
    if (recording.length && !recording.includes(m.recording))      return false;
    if (source.length    && !source.includes(m.type))              return false;
    if (monitorIds.length && !monitorIds.includes(m.id))           return false;

    if (status.length) {
      const isActive = m.capturing !== 'None';
      const token = isActive ? 'active' : 'disabled';
      if (!status.includes(token)) return false;
    }
    return true;
  });
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
  const { isAuthenticated } = useAuthStore();

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

  const groupsQ = useQuery({
    queryKey: ['groups'],
    queryFn: () => listGroups({ page: 1, page_size: 200 }),
    enabled: isAuthenticated,
  });
  const groupMonitorsQ = useQuery({
    queryKey: ['groups-monitors'],
    queryFn: () => listGroupMonitors({ page: 1, page_size: 1000 }),
    enabled: isAuthenticated,
  });

  const groups: Group[] = groupsQ.data?.items ?? [];
  const groupMonitors: GroupMonitor[] = groupMonitorsQ.data?.items ?? [];

  // gid → Set<monitorId>
  const groupMembership = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const gm of groupMonitors) {
      if (!map.has(gm.group_id)) map.set(gm.group_id, new Set<number>());
      map.get(gm.group_id)!.add(gm.monitor_id);
    }
    return map;
  }, [groupMonitors]);

  // Recompute filtered list whenever selections or input list change.
  const filtered = useMemo(
    () => filterMonitors(monitors, {
      groupIds, capturing, analysing, recording, status, source, monitorIds,
    }, groupMembership),
    [monitors, groupIds, capturing, analysing, recording, status, source, monitorIds, groupMembership],
  );

  // onChange is stored in a ref so we can fire it from an effect without
  // looping when the parent re-creates the callback each render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    onChangeRef.current(filtered);
  }, [filtered]);

  const totalSelected =
    groupIds.length + capturing.length + analysing.length +
    recording.length + status.length + source.length + monitorIds.length;

  return (
    <div
      className={clsx(
        'flex flex-wrap items-center gap-2',
        className,
      )}
      aria-label="Monitor filter bar"
      role="group"
    >
      <Filter size={14} className="text-text-muted" aria-hidden />

      <Chip
        label="Groups"
        emptyLabel="All groups"
        options={groups.map((g) => ({ value: String(g.id), label: g.name }))}
        selected={groupIds.map(String)}
        onChange={(vals) => setGroupIds(vals.map(Number))}
      />

      <Chip
        label="Capturing"
        emptyLabel="Any"
        options={CAPTURING_OPTS.map((v) => ({ value: v, label: v }))}
        selected={capturing}
        onChange={setCapturing}
      />

      <Chip
        label="Analysing"
        emptyLabel="Any"
        options={ANALYSING_OPTS.map((v) => ({ value: v, label: v }))}
        selected={analysing}
        onChange={setAnalysing}
      />

      <Chip
        label="Recording"
        emptyLabel="Any"
        options={RECORDING_OPTS.map((v) => ({ value: v, label: v }))}
        selected={recording}
        onChange={setRecording}
      />

      <Chip
        label="Status"
        emptyLabel="Any"
        options={STATUS_OPTS.map((o) => ({ value: o.value, label: o.label }))}
        selected={status}
        onChange={setStatus}
      />

      <Chip
        label="Source"
        emptyLabel="Any"
        options={SOURCE_OPTS.map((v) => ({ value: v, label: v }))}
        selected={source}
        onChange={setSource}
      />

      <Chip
        label="Monitor"
        emptyLabel="Any"
        options={monitors.map((m) => ({ value: String(m.id), label: m.name }))}
        selected={monitorIds.map(String)}
        onChange={(vals) => setMonitorIds(vals.map(Number))}
      />

      {totalSelected > 0 && (
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-border-subtle text-text-muted hover:border-crimson/40 hover:text-crimson transition-colors"
          aria-label="Reset all filters"
        >
          <X size={11} />
          Reset
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
  const summary = count === 0 ? emptyLabel : `${count} selected`;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label} filter${count > 0 ? `, ${count} selected` : ''}`}
        className={clsx(
          'flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border transition-colors',
          count > 0
            ? 'border-cyan/50 bg-cyan/10 text-cyan'
            : 'border-border-subtle bg-surface/40 text-text-secondary hover:border-cyan/40 hover:text-cyan',
        )}
      >
        <span className="font-medium">{label}</span>
        {count > 0 && (
          <span
            className="px-1 min-w-[1rem] text-center text-[10px] font-mono rounded bg-cyan/20 text-cyan tabular-nums"
            aria-label={`${count} active`}
          >
            {count}
          </span>
        )}
        {count === 0 && (
          <span className="text-text-muted italic">{summary}</span>
        )}
        <ChevronDown size={12} className={clsx('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={`${label} options`}
          aria-multiselectable="true"
          className="absolute left-0 top-full mt-1 z-40 w-56 max-h-80 overflow-y-auto rounded-lg border border-border-subtle bg-panel/95 backdrop-blur-md shadow-[0_18px_44px_rgba(0,0,0,0.45)] p-1"
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-[11px] italic text-text-muted">
              No options
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
                        'hover:bg-cyan/10',
                        checked && 'text-cyan',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(opt.value)}
                        className="accent-cyan"
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
                className="w-full text-left px-2 py-1 text-[11px] text-text-muted hover:text-crimson transition-colors"
              >
                Clear {label.toLowerCase()}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
