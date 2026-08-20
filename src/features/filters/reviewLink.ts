import type { FilterQuery } from '@/api/filters';
import { toZmDateTime } from '@/features/events/eventsSearch';
import { resolveDateValue } from './attrs';

export interface ReviewSearch {
  monitor_id?: number;
  min_time?: string;
  max_time?: string;
}

function zm(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return toZmDateTime(
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
  );
}

/**
 * Legacy "View Matches" opens Montage Review framed by the filter: the
 * single `MonitorId =` term becomes the preselected monitor and the
 * `StartDateTime` / `EndDateTime` / `DateTime` bounds the time range.
 * Relative values (`-1 day`) resolve against `now`. Anything the review
 * page cannot express is simply not carried over.
 */
export function reviewSearchFromQuery(query: FilterQuery, now: Date = new Date()): ReviewSearch {
  const out: ReviewSearch = {};
  let min: number | null = null;
  let max: number | null = null;
  for (const term of query.terms) {
    const val = term.val == null ? '' : String(term.val);
    if (term.attr === 'MonitorId' && term.op === '=') {
      const id = Number(val);
      if (Number.isInteger(id) && id > 0) out.monitor_id = id;
      continue;
    }
    if (term.attr === 'StartDateTime' || term.attr === 'EndDateTime' || term.attr === 'DateTime') {
      const ms = resolveDateValue(val, now);
      if (ms == null) continue;
      if (term.op === '>=' || term.op === '>') min = min === null ? ms : Math.min(min, ms);
      if (term.op === '<=' || term.op === '<') max = max === null ? ms : Math.max(max, ms);
      if (term.op === '=') { min = ms; max = ms; }
    }
  }
  if (min !== null) out.min_time = zm(min);
  if (max !== null) out.max_time = zm(max);
  return out;
}
