/**
 * Legacy Montage Review's "Fit" button: shrink (or grow) the timeline window
 * so it exactly spans the recorded events, instead of whatever preset the
 * operator last clicked. Pure so the maths is testable without the network.
 */

export interface EventSpan {
  /** Epoch ms of the event's start. */
  startMs: number;
  /** Epoch ms of the event's end; open events use "now". */
  endMs: number;
}

export interface FitOptions {
  /** Breathing room either side, as a fraction of the span. */
  padFraction?: number;
  /** Never produce a window shorter than this. */
  minSpanMs?: number;
}

/**
 * The tightest window covering every span, padded a little. Returns null when
 * there is nothing to fit, so the caller can leave the range alone rather
 * than jumping somewhere arbitrary.
 */
export function fitRange(
  spans: readonly EventSpan[],
  { padFraction = 0.02, minSpanMs = 60_000 }: FitOptions = {},
): { start: Date; end: Date } | null {
  const usable = spans.filter(
    (s) => Number.isFinite(s.startMs) && Number.isFinite(s.endMs) && s.endMs >= s.startMs,
  );
  if (usable.length === 0) return null;

  let min = Infinity;
  let max = -Infinity;
  for (const s of usable) {
    if (s.startMs < min) min = s.startMs;
    if (s.endMs > max) max = s.endMs;
  }

  let span = max - min;
  if (span < minSpanMs) {
    // A single instant (or one very short event): centre a minimum window.
    const centre = min + span / 2;
    min = centre - minSpanMs / 2;
    max = centre + minSpanMs / 2;
    span = minSpanMs;
  }

  const pad = span * padFraction;
  return { start: new Date(min - pad), end: new Date(max + pad) };
}
