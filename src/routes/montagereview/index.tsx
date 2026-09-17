import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

/**
 * Legacy `?view=montagereview&MonitorId=&minTime=&maxTime=&current=&speed=
 * &scale=&live=&fit=&z<id>=`: preselect one monitor, open on a range, at a
 * playhead, speed, scale and per-monitor zoom. Times are whatever the legacy
 * UI put in the URL (`YYYY-MM-DD HH:MM:SS` or ISO); the hook parses them.
 */
interface MontageReviewSearchParams {
  monitor_id?: number;
  min_time?: string;
  max_time?: string;
  /** Legacy `&current=`: where the playhead starts. */
  current?: string;
  /** Legacy `&speed=`: one of `REVIEW_SPEEDS`. */
  speed?: string;
  /** Legacy `&scale=`: 0.1–1.0. */
  scale?: string;
  /** Legacy `&live=1`: open in live mode. */
  live?: string;
  /** Legacy `&fit=0|1`: open fitted or scaled. */
  fit?: string;
}
/**
 * `z<id>` is one key per monitor, so it cannot be spelled in the interface
 * without an index signature that would stop every other caller passing a
 * plain object. The keys survive validation and the page reads them from the
 * loose search record.
 */
type ValidatedReviewSearch = MontageReviewSearchParams & Record<string, unknown>;

export const Route = createFileRoute('/montagereview/')({
  component: () => <SkinPage page="montagereview" />,
  validateSearch: (search: Record<string, unknown>): MontageReviewSearchParams => {
    const out: ValidatedReviewSearch = {
      monitor_id: toInt(search.monitor_id),
      min_time: toStr(search.min_time),
      max_time: toStr(search.max_time),
      current: toStr(search.current),
      speed: toStr(search.speed),
      scale: toStr(search.scale),
      live: toStr(search.live),
      fit: toStr(search.fit),
    };
    // `z<id>` is one key per monitor, so it cannot be spelled out.
    for (const [key, value] of Object.entries(search)) {
      if (!/^z\d+$/.test(key)) continue;
      const v = toStr(typeof value === 'number' ? String(value) : value);
      if (v) out[key] = v;
    }
    return out;
  },
});

function toInt(v: unknown): number | undefined {
  const n = Number(v);
  return v != null && v !== '' && Number.isInteger(n) && n > 0 ? n : undefined;
}
function toStr(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}
