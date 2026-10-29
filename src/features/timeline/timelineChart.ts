import type { Frame } from '@/api/frames';
import type { Monitor, ZmEvent } from '@/types';

/**
 * The chart legacy `?view=timeline` draws (`timeline.php`), as pure data.
 *
 * Legacy cuts the x axis into `GRAPH_WIDTH` slots, drops every event into the
 * slots it spans, merges neighbours so a bar is never thinner than three
 * slots or longer than six per piece, and stacks the alarm-frame scores per
 * slot into an activity strip above the per-monitor bars. Times are Unix
 * seconds throughout, as legacy's `strtotime` gives them; labels are
 * formatted in the browser's zone where legacy uses the server's.
 */

/** `$chart['graph']`: 600 slots across, 160 px tall. */
export const GRAPH_WIDTH = 600;
export const GRAPH_HEIGHT = 160;
/** `$minEventWidth` / `$maxEventWidth`, in slots. */
const MIN_EVENT_WIDTH = 3;
const MAX_EVENT_WIDTH = 6;
/** Overlay mode's bar height bounds (`$minEventBarHeight` / `$maxEventBarHeight`). */
const MIN_EVENT_BAR_HEIGHT = 10;
const MAX_EVENT_BAR_HEIGHT = 40;

/** Legacy's fallback when a monitor has no `WebColour`. */
export const DEFAULT_MONITOR_COLOUR = '#43bcf2';

export function monitorColour(monitor: Pick<Monitor, 'web_colour'> | undefined): string {
  const colour = monitor?.web_colour?.trim();
  return colour ? colour : DEFAULT_MONITOR_COLOUR;
}

interface ScaleDef {
  name: string;
  factor: number;
  align: number;
  zoomout: number;
  /** PHP `date()` format of the tick label. */
  label: string;
  /** Which part of the date has to change for a new tick; defaults to `label`. */
  labelCheck?: string;
}

/** `$scales`, coarsest first (timeline.php:252-263). */
const SCALES: readonly ScaleDef[] = [
  { name: 'year', factor: 60 * 60 * 24 * 365, align: 1, zoomout: 2, label: 'Y' },
  { name: 'month', factor: 60 * 60 * 24 * 30, align: 1, zoomout: 12, label: 'M' },
  { name: 'week', factor: 60 * 60 * 24 * 7, align: 1, zoomout: 4.25, label: 'd/m', labelCheck: 'W' },
  { name: 'day', factor: 60 * 60 * 24, align: 1, zoomout: 7, label: 'd' },
  { name: 'hour4', factor: 60 * 60, align: 4, zoomout: 6, label: 'H:00', labelCheck: 'H' },
  { name: 'hour', factor: 60 * 60, align: 1, zoomout: 4, label: 'H:00', labelCheck: 'H' },
  { name: 'minute10', factor: 60, align: 10, zoomout: 6, label: 'H:i', labelCheck: 'i' },
  { name: 'minute', factor: 60, align: 1, zoomout: 10, label: 'H:i', labelCheck: 'i' },
  { name: 'second10', factor: 1, align: 10, zoomout: 6, label: 's' },
  { name: 'second', factor: 1, align: 1, zoomout: 10, label: 's' },
];

export interface TimelineScale extends ScaleDef {
  range: number;
  divisor: number;
  lines: number;
}

/** `getDateScale` (timeline_functions.php:3): the coarsest scale that still gives `minLines` ticks. */
export function getDateScale(range: number, minLines = 4, maxLines = 12): TimelineScale {
  let picked: ScaleDef = SCALES[SCALES.length - 1];
  let scaleRange: number | undefined;
  for (const scale of SCALES) {
    const r = Math.floor(range / (scale.factor * scale.align));
    if (r >= minLines) {
      picked = scale;
      scaleRange = r;
      break;
    }
  }
  const r = scaleRange ?? Math.floor(range / (picked.factor * picked.align));
  let divisor = 1;
  while (r / divisor > maxLines) divisor++;
  return { ...picked, range: r, divisor, lines: Math.floor(r / divisor) };
}

/** `getYScale`: at most `maxLines` score gridlines. */
export function getYScale(range: number, minLines = 1, maxLines = 8): { divisor: number; lines: number } {
  void minLines;
  let divisor = 1;
  while (range / divisor > maxLines) divisor++;
  return { divisor, lines: Math.floor((range - 1) / divisor) + 1 };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/** The subset of PHP `date()` the timeline uses, in local time. */
export function phpDate(format: string, seconds: number): string {
  const d = new Date(seconds * 1000);
  let out = '';
  for (const ch of format) {
    switch (ch) {
      case 'Y': out += String(d.getFullYear()); break;
      case 'M': out += MONTHS[d.getMonth()]; break;
      case 'm': out += pad(d.getMonth() + 1); break;
      case 'd': out += pad(d.getDate()); break;
      case 'H': out += pad(d.getHours()); break;
      case 'i': out += pad(d.getMinutes()); break;
      case 's': out += pad(d.getSeconds()); break;
      case 'W': out += pad(isoWeek(d)); break;
      default: out += ch;
    }
  }
  return out;
}

/** ZoneMinder's `STRF_FMT_DATETIME_DB`, `YYYY-MM-DD HH:MM:SS`, local. */
export function formatDbTime(seconds: number): string {
  return phpDate('Y-m-d H:i:s', seconds);
}

/**
 * A time from the URL in seconds: `YYYY-MM-DD HH:MM[:SS]` (or with `T`) is
 * local wall clock, as legacy writes it; anything else goes to `Date.parse`.
 */
export function parseWhen(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  const ms = m
    ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)).getTime()
    : Date.parse(value);
  return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000);
}

export interface WindowRequest {
  min_time?: string;
  max_time?: string;
  mid_time?: string;
  /** Seconds. */
  range?: number;
}

/**
 * What the URL pins of the window (timeline.php:165-201): `range` around
 * `midTime`, from `minTime` or back from `maxTime`; else `minTime`/`maxTime`
 * as given. A missing edge is filled from the events themselves.
 */
export function requestedWindow(req: WindowRequest): { minT?: number; maxT?: number } {
  const min = parseWhen(req.min_time);
  const mid = parseWhen(req.mid_time);
  const max = parseWhen(req.max_time);
  const range = req.range;
  if (range != null && Number.isInteger(range) && range > 0) {
    const half = Math.floor(range / 2);
    // Legacy's `!($range%1)` is always true, so the far edge loses a second.
    if (mid != null) return { minT: mid - half, maxT: mid + half - 1 };
    if (min != null) return { minT: min, maxT: min + range };
    if (max != null) return { minT: max - range, maxT: max };
    return {};
  }
  return { minT: min, maxT: max };
}

export interface ChartWindow {
  /** First second on the axis. */
  lo: number;
  /** Last second on the axis. */
  hi: number;
  range: number;
  mid: number;
  scale: TimelineScale;
}

/** Seconds east of UTC at `t`, so alignment lands on local midnight, not UTC's. */
function zoneOffset(t: number): number {
  return -new Date(t * 1000).getTimezoneOffset() * 60;
}

/**
 * Snap the window outwards to whole major-scale units (timeline.php:265-277),
 * never past now.
 */
export function alignWindow(minT: number, maxT: number, nowT: number): ChartWindow {
  const scale = getDateScale(maxT - minT + 1, 4, 12);
  const unit = scale.factor * scale.align;
  const offMin = zoneOffset(minT);
  let lo = minT - ((((minT + offMin) % unit) + unit) % unit);
  const offMax = zoneOffset(maxT);
  let hi = maxT + (unit - ((((maxT + offMax) % unit) + unit) % unit)) - 1;
  if (hi > nowT) hi = nowT;
  if (hi <= lo) hi = lo + 1;
  lo = Math.floor(lo);
  const range = hi - lo + 1;
  return { lo, hi, range, mid: lo + Math.floor(range / 2), scale };
}

/** One piece of an event bar. */
export interface EventSlot {
  /** Slot index the piece starts at, 0…GRAPH_WIDTH-1. */
  index: number;
  /** Slots wide. */
  width: number;
  event: ZmEvent;
  /** Frame to preview: 1, or the frame the piece starts on for a split long event. */
  frame: number;
  /** Where in the event the slot falls, as a frame number (legacy `offset`). */
  offset: number;
}

/** One bar of the activity strip. */
export interface ActivitySlot {
  index: number;
  monitorId: number;
  /** The highest frame score in the slot. */
  value: number;
  event: ZmEvent;
  /** Frame number to preview, or `alarm` when only the event's MaxScore is known. */
  frame: number | 'alarm';
}

export interface TimelineRow {
  monitorId: number;
  name: string;
  colour: string;
  /** Px from the top of the graph. */
  top: number;
  slots: EventSlot[];
}

export interface XTick {
  /** Percent across. */
  x: number;
  label: string;
}

/** A clickable stretch between two ticks; clicking zooms to it (`tlZoomBounds`). */
export interface ZoomBand {
  x: number;
  width: number;
  minT: number;
  maxT: number;
}

export interface YTick {
  value: number;
  /** Px up from the bottom of the activity strip. */
  bottom: number;
}

export interface TimelineChart extends ChartWindow {
  rows: TimelineRow[];
  /** Tallest first within each slot, as legacy stacks them. */
  activity: ActivitySlot[];
  /** Activity bar height in px for a score. */
  activityHeightOf: (value: number) => number;
  eventBarHeight: number;
  eventsHeight: number;
  activityHeight: number;
  xTicks: XTick[];
  zoomBands: ZoomBand[];
  yTicks: YTick[];
  /** The range line under the chart, e.g. `14:00 - 15:59, 21 Aug 2026`. */
  title: string;
}

function seconds(iso: string | null | undefined): number | undefined {
  if (!iso) return undefined;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** `$title` (timeline.php:563-578): coarser fields only when they differ. */
export function rangeTitle(lo: number, hi: number): string {
  const a = new Date(lo * 1000);
  const b = new Date(hi * 1000);
  if (a.getFullYear() !== b.getFullYear()) return `${phpDate('M Y', lo)} - ${phpDate('M Y', hi)}`;
  if (a.getMonth() !== b.getMonth()) return `${phpDate('M', lo)} - ${phpDate('M Y', hi)}`;
  if (a.getDate() !== b.getDate()) return `${phpDate('d', lo)} - ${phpDate('d M Y', hi)}`;
  return `${phpDate('H:i', lo)} - ${phpDate('H:i, d M Y', hi)}`;
}

/** PHP's `(int)"07"` — leading digits, else 0. */
function phpInt(s: string): number {
  const m = /^\d+/.exec(s);
  return m ? Number(m[0]) : 0;
}

/** `drawXGrid`: a tick every `divisor` label changes, and a zoom band between ticks. */
export function xGrid(win: ChartWindow): { ticks: XTick[]; bands: ZoomBand[] } {
  const { scale, lo } = win;
  const density = win.range / GRAPH_WIDTH;
  const check = scale.labelCheck ?? scale.label;
  const ticks: XTick[] = [];
  const bands: ZoomBand[] = [];
  let labelCount = 0;
  let lastTick = 0;
  let lastLabel: string | number | undefined;
  for (let i = 0; i < GRAPH_WIDTH; i++) {
    const x = round1((100 * i) / GRAPH_WIDTH);
    const t = Math.floor(lo + i * density);
    const label = scale.align > 1 ? Math.floor(phpInt(phpDate(check, t)) / scale.align) : phpDate(check, t);
    if (lastLabel === undefined || lastLabel !== label) labelCount++;
    if (labelCount >= scale.divisor) {
      labelCount = 0;
      if (lastLabel !== undefined) {
        ticks.push({ x, label: phpDate(scale.label, t) });
        if (scale.name !== 'second') {
          bands.push({
            x: (100 * lastTick) / GRAPH_WIDTH,
            width: (100 * (i - lastTick)) / GRAPH_WIDTH,
            minT: Math.floor(lo + lastTick * density),
            maxT: Math.floor(lo + i * density),
          });
        }
        lastTick = i;
      }
    }
    lastLabel = label;
  }
  bands.push({
    x: (100 * lastTick) / GRAPH_WIDTH,
    width: (100 * (GRAPH_WIDTH - lastTick)) / GRAPH_WIDTH,
    minT: Math.floor(lo + lastTick * density),
    maxT: Math.floor(lo + GRAPH_WIDTH * density),
  });
  return { ticks, bands };
}

/**
 * Lay the events out (timeline.php:298-561, overlay mode). `framesByEvent`
 * holds the scored frames of the events whose frames were fetched; an event
 * without them adds its MaxScore to the slot it starts in, which is exactly
 * what legacy does for an event that fits one slot.
 */
export function buildChart(opts: {
  window: ChartWindow;
  events: ZmEvent[];
  framesByEvent?: Map<number, Frame[]>;
  monitors: Pick<Monitor, 'id' | 'name' | 'web_colour'>[];
  nowT: number;
}): TimelineChart {
  const win = opts.window;
  const { lo } = win;
  const density = win.range / GRAPH_WIDTH;
  const byId = new Map(opts.monitors.map((m) => [m.id, m]));
  const monEventSlots = new Map<number, Map<number, EventSlot & { count: number }>>();
  const monFrameSlots = new Map<number, Map<number, ActivitySlot>>();
  let yHi = 0;

  const events = [...opts.events].sort((a, b) => a.id - b.id);
  for (const event of events) {
    const startT = seconds(event.start_date_time);
    if (startT == null) continue;
    const endT = seconds(event.end_date_time) ?? opts.nowT;
    if (!monEventSlots.has(event.monitor_id)) {
      monEventSlots.set(event.monitor_id, new Map());
      monFrameSlots.set(event.monitor_id, new Map());
    }
    const evSlots = monEventSlots.get(event.monitor_id)!;
    const frSlots = monFrameSlots.get(event.monitor_id)!;

    const rawStart = Math.floor((startT - lo) / density);
    const rawEnd = Math.floor((endT - lo) / density);
    const startIndex = Math.max(0, rawStart);
    const endIndex = Math.min(GRAPH_WIDTH - 1, rawEnd);
    for (let i = startIndex; i <= endIndex; i++) {
      const existing = evSlots.get(i);
      if (existing) {
        existing.count++;
        continue;
      }
      const offset = rawStart === rawEnd
        ? 1
        : 1 + (event.frames ? Math.floor((event.frames - 1) * ((i - rawStart) / (rawEnd - rawStart))) : 0);
      evSlots.set(i, { index: i, count: 0, width: 1, offset, frame: 1, event });
    }

    const maxScore = event.max_score ?? 0;
    if (maxScore <= 0) continue;
    const put = (i: number, value: number, frame: number | 'alarm') => {
      const slot = frSlots.get(i);
      if (!slot) frSlots.set(i, { index: i, monitorId: event.monitor_id, value, event, frame });
      else if (value > slot.value) Object.assign(slot, { value, event, frame });
      if (value > yHi) yHi = value;
    };
    const frames = opts.framesByEvent?.get(event.id);
    // No scored frames to hand (not fetched, or none came back): fall back
    // to the event's MaxScore where it starts rather than drawing nothing.
    if (startIndex === endIndex || !frames?.length) {
      if (startIndex <= endIndex && startIndex < GRAPH_WIDTH) {
        const best = frames?.reduce<Frame | undefined>((b, f) => (!b || f.score > b.score ? f : b), undefined);
        put(startIndex, maxScore, best ? best.frame_id : 'alarm');
      }
      continue;
    }
    for (const frame of frames) {
      if (!(frame.score > 0)) continue;
      const frameT = startT + Number(frame.delta);
      const index = Math.floor((frameT - lo) / density);
      if (index < 0 || index >= GRAPH_WIDTH) continue;
      put(index, frame.score, frame.frame_id);
    }
  }

  // Optimise boxes: merge a long event's slots up to six wide, and swallow
  // short neighbours until a piece is three wide.
  for (const evSlots of monEventSlots.values()) {
    let curr: EventSlot | undefined;
    for (let i = 0; i < GRAPH_WIDTH; i++) {
      const slot = evSlots.get(i);
      if (!slot) {
        curr = undefined;
        continue;
      }
      if (curr) {
        if (curr.event.id === slot.event.id) {
          if (curr.width < MAX_EVENT_WIDTH) {
            curr.width++;
            evSlots.delete(i);
            continue;
          } else if (curr.offset < slot.offset) {
            slot.frame = slot.offset;
          }
        } else if (curr.width < MIN_EVENT_WIDTH) {
          curr.width++;
          evSlots.delete(i);
          continue;
        }
      }
      curr = slot;
    }
  }

  const monitorIds = [...monEventSlots.keys()].sort((a, b) => a - b);
  const n = monitorIds.length;
  let eventBarHeight = MAX_EVENT_BAR_HEIGHT;
  let eventsHeight = MAX_EVENT_BAR_HEIGHT;
  if (n > 0) {
    eventBarHeight = MIN_EVENT_BAR_HEIGHT;
    while ((eventsHeight = eventBarHeight * n + (n - 1)) < MAX_EVENT_BAR_HEIGHT) eventBarHeight++;
  }
  const activityHeight = GRAPH_HEIGHT - eventsHeight;
  const yRange = yHi + 1;
  const yDensity = yRange / activityHeight;

  const rows: TimelineRow[] = monitorIds.map((id, idx) => {
    const monitor = byId.get(id);
    return {
      monitorId: id,
      name: monitor?.name ?? `#${id}`,
      colour: monitorColour(monitor),
      top: activityHeight + idx * (eventBarHeight + 1),
      slots: [...monEventSlots.get(id)!.values()]
        .sort((a, b) => a.index - b.index)
        .map((slot) => ({
          index: slot.index, width: slot.width, event: slot.event, frame: slot.frame, offset: slot.offset,
        })),
    };
  });

  const activity: ActivitySlot[] = [];
  for (const id of monitorIds) activity.push(...monFrameSlots.get(id)!.values());
  activity.sort((a, b) => a.index - b.index || b.value - a.value);

  const y = getYScale(yRange, 1, 8);
  const yTicks: YTick[] = [];
  for (let i = 0; i < y.lines; i++) {
    const value = i * y.divisor;
    yTicks.push({ value, bottom: Math.floor(value / yDensity) });
  }

  const { ticks, bands } = xGrid(win);
  return {
    ...win,
    rows,
    activity,
    activityHeightOf: (value) => Math.floor(value / yDensity),
    eventBarHeight,
    eventsHeight,
    activityHeight,
    xTicks: ticks,
    zoomBands: bands,
    yTicks,
    title: rangeTitle(win.lo, win.hi),
  };
}

/**
 * Legacy's `.imageHeight`: the preview box is a square of the panel width
 * scaled by `100 / max_aspect_ratio`, where the ratio is the largest
 * capture `Width / Height` among the monitors on the chart. Capture
 * dimensions, not the event's — a rotated monitor still gets a landscape
 * box and its portrait image fits inside it. 16:9 when nothing is known.
 */
export function imagePaddingTop(monitors: ReadonlyArray<{ width?: number | null; height?: number | null }>): string {
  let max = 0;
  for (const m of monitors) {
    const w = m.width ?? 0, h = m.height ?? 0;
    if (w > 0 && h > 0) max = Math.max(max, Math.round((100 * w) / h) / 100);
  }
  return `${max > 0 ? Math.round((10000 / max)) / 100 : 56.25}%`;
}
