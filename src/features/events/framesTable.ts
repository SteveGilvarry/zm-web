import type { Frame } from '@/api/frames';
import { escapeCsvField } from '@/features/logs/csv';

/**
 * The frames table's columns, in legacy's order (`views/frames.php`). Event
 * Id is off by default there, and the thumbnail is an image, so it takes no
 * part in sorting, searching or export.
 */
export const FRAMES_COLUMNS = [
  { key: 'event_id',   label: 'Event Id',   numeric: true,  data: true },
  { key: 'frame_id',   label: 'Frame Id',   numeric: true,  data: true },
  { key: 'type',       label: 'Type',       numeric: false, data: true },
  { key: 'time_stamp', label: 'Time Stamp', numeric: false, data: true },
  { key: 'delta',      label: 'Time Delta', numeric: true,  data: true },
  { key: 'score',      label: 'Score',      numeric: true,  data: true },
  { key: 'thumbnail',  label: 'Thumbnail',  numeric: false, data: false },
] as const;

export type FramesColumnKey = (typeof FRAMES_COLUMNS)[number]['key'];

/** Legacy hides Event Id on a page that is already about one event. */
export const FRAMES_DEFAULT_HIDDEN: readonly FramesColumnKey[] = ['event_id'];

export type FramesSortKey = Exclude<FramesColumnKey, 'thumbnail'>;
export type SortDir = 'asc' | 'desc';

/** The cell value a search matches and an export writes. */
export function frameField(f: Frame, key: FramesColumnKey): string | number {
  switch (key) {
    case 'event_id':   return f.event_id;
    case 'frame_id':   return f.frame_id;
    case 'type':       return f.type;
    case 'time_stamp': return f.time_stamp;
    case 'delta':      return Number(f.delta).toFixed(2);
    case 'score':      return f.score;
    case 'thumbnail':  return '';
  }
}

/**
 * Substring search across the visible data columns — bootstrap-table's search
 * box, which is case-insensitive and matches anywhere in a cell.
 */
export function filterFrames(frames: Frame[], query: string, visible: FramesColumnKey[]): Frame[] {
  const q = query.trim().toLowerCase();
  if (!q) return frames;
  const keys = visible.filter((k) => k !== 'thumbnail');
  return frames.filter((f) => keys.some((k) => String(frameField(f, k)).toLowerCase().includes(q)));
}

/**
 * Sort by one column. `/frames` takes no sort parameter, so this orders the
 * rows that were fetched — the whole event when the page size is All.
 */
export function sortFrames(frames: Frame[], key: FramesSortKey | null, dir: SortDir): Frame[] {
  if (!key) return frames;
  const numeric = FRAMES_COLUMNS.find((c) => c.key === key)?.numeric ?? false;
  const sign = dir === 'desc' ? -1 : 1;
  return [...frames].sort((a, b) => {
    const av = frameField(a, key);
    const bv = frameField(b, key);
    if (numeric) return sign * (Number(av) - Number(bv));
    return sign * String(av).localeCompare(String(bv));
  });
}

/**
 * The visible rows as CSV (legacy's Export → CSV). English labels in the
 * header so the file is stable whatever the UI language is.
 */
export function framesToCsv(frames: Frame[], visible: FramesColumnKey[]): string {
  const keys = visible.filter((k) => k !== 'thumbnail');
  const labelOf = (k: FramesColumnKey) => FRAMES_COLUMNS.find((c) => c.key === k)?.label ?? k;
  const header = keys.map((k) => escapeCsvField(labelOf(k))).join(',');
  const rows = frames.map((f) => keys.map((k) => escapeCsvField(frameField(f, k))).join(','));
  return [header, ...rows].join('\n');
}
