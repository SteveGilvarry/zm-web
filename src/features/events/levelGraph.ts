import type { Frame } from '@/api/frames';

/**
 * The motion-score graph under the event video, after 1.39.41's
 * `web/js/LevelGraph.js` (commits 4ea307a1c / 33661907d), which replaced the
 * flat alarm-cue strip: a line of each frame's score over the event's length,
 * alarm periods as shaded bands behind it, and the score under the pointer in
 * the hover readout.
 *
 * Legacy also draws an audio-level line on the same axis. `/frames` carries
 * no audio level, so that series is not here.
 */

export interface LevelSample {
  /** Seconds from the event start, clamped into the event. */
  t: number;
  score: number;
  type: string;
}

export interface LevelSeries {
  samples: LevelSample[];
  motionMax: number;
  /** An event with every score 0 draws no line (`hasScores`). */
  hasScores: boolean;
}

/**
 * `levelGraphSeries`: frames as plottable samples, sorted by time. A frame
 * whose delta does not parse is dropped rather than plotted at 0, and one
 * past the end of the event is clamped onto it.
 */
export function levelGraphSeries(frames: Frame[], eventLength: number): LevelSeries {
  const length = eventLength > 0 ? eventLength : 0;
  const samples: LevelSample[] = [];
  let motionMax = 0;
  for (const f of frames) {
    const t = parseFloat(f.delta);
    if (!Number.isFinite(t)) continue;
    const clamped = length ? Math.min(Math.max(t, 0), length) : Math.max(t, 0);
    const score = Math.max(0, Math.trunc(f.score) || 0);
    if (score > motionMax) motionMax = score;
    samples.push({ t: clamped, score, type: f.type });
  }
  samples.sort((a, b) => a.t - b.t);
  return { samples, motionMax, hasScores: motionMax > 0 };
}

export interface LevelBand {
  start: number;
  end: number;
}

/**
 * `levelGraphBands`: an alarm frame covers from its own delta to the next
 * frame's (the last one to the end of the event); touching intervals merge
 * into one band.
 */
export function levelGraphBands(samples: LevelSample[], eventLength: number): LevelBand[] {
  const bands: LevelBand[] = [];
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].type !== 'Alarm') continue;
    const start = samples[i].t;
    const end = i + 1 < samples.length ? samples[i + 1].t : eventLength;
    if (!(end > start)) continue;
    const last = bands[bands.length - 1];
    if (last && last.end >= start) last.end = Math.max(last.end, end);
    else bands.push({ start, end });
  }
  return bands;
}

/**
 * `levelGraphSampleAt`: the sample nearest `t` — nearest rather than the one
 * before, since frames are stored well below the capture rate and snapping
 * back would read a stale value across most of the gap.
 */
export function levelGraphSampleAt(samples: LevelSample[], t: number): LevelSample | null {
  if (samples.length === 0) return null;
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  const after = samples[lo];
  const before = lo > 0 ? samples[lo - 1] : null;
  if (!before) return after;
  return Math.abs(after.t - t) < Math.abs(t - before.t) ? after : before;
}

/** Room above the top sample so a peak's stroke is not clipped (`LEVEL_GRAPH_TOP_PAD`). */
export const LEVEL_GRAPH_TOP_PAD = 2;

/**
 * `levelGraphPoints`: the motion line as an SVG `points` attribute on a
 * `width` × `height` box whose floor is its bottom edge, each series scaled
 * to its own maximum.
 */
export function levelGraphPoints(
  samples: LevelSample[],
  eventLength: number,
  motionMax: number,
  width: number,
  height: number,
): string {
  const length = eventLength > 0 ? eventLength : 1;
  const max = motionMax > 0 ? motionMax : 1;
  const plot = Math.max(1, height - LEVEL_GRAPH_TOP_PAD);
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return samples
    .map((s) => {
      const x = (Math.min(Math.max(s.t, 0), length) / length) * width;
      const y = height - (Math.min(Math.max(s.score, 0), max) / max) * plot;
      return `${round2(x)},${round2(y)}`;
    })
    .join(' ');
}

/**
 * `levelGraphReadout`: the score the hover indicator appends to the time,
 * or null when the event has no scores to read.
 */
export function levelGraphScoreAt(series: LevelSeries, t: number): number | null {
  if (!series.hasScores) return null;
  return levelGraphSampleAt(series.samples, t)?.score ?? null;
}
