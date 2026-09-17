import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * What happens when an event reaches its end (legacy `replayMode`, default
 * `none`):
 *
 *  - `none`    — stop.
 *  - `single`  — play the same event again.
 *  - `all`     — wait the real gap until the next event started, then play it.
 *  - `gapless` — play the next event at once.
 */
export type ReplayMode = 'none' | 'single' | 'all' | 'gapless';
export const REPLAY_MODES: readonly ReplayMode[] = ['none', 'single', 'all', 'gapless'];

/**
 * Player scale, the legacy `$scales` keys: `0` Auto (fit the viewport),
 * `100` Actual (the recording's own pixels), `fit_to_width`, or a cap on the
 * frame's long side. Remembered per monitor like the `zmEventScale<mid>`
 * cookie; a monitor's own `default_scale` seeds it.
 */
export type PlaybackScale =
  | '0' | '100' | 'fit_to_width'
  | '480px' | '640px' | '800px' | '1024px' | '1280px' | '1600px';
export const PLAYBACK_SCALES: readonly PlaybackScale[] = [
  '0', '100', 'fit_to_width', '480px', '640px', '800px', '1024px', '1280px', '1600px',
];
export function isPlaybackScale(v: unknown): v is PlaybackScale {
  return typeof v === 'string' && (PLAYBACK_SCALES as readonly string[]).includes(v);
}

/**
 * Playback rates, the legacy `$rates` list in multiples of real time:
 * reverse, Stop (0), forward. Reverse rates step `currentTime` back
 * (browsers cannot play an mp4 backwards); 16 is the most Chrome allows.
 */
export const PLAYBACK_RATES: readonly number[] = [
  -16, -10, -5, -2, -1, -0.5, -0.25, 0, 0.25, 0.5, 1, 2, 5, 10, 16,
];

/**
 * Which container the player is forced to use (legacy's `&codec=`):
 * `auto` follows the backend's `recommended_mode`, the other two force the
 * progressive MP4 or the HLS playlist. Legacy also offers MJPEG, which
 * zm-api does not serve for a recorded event.
 */
export type PlaybackCodec = 'auto' | 'mp4' | 'mp4hls';
export const PLAYBACK_CODECS: readonly PlaybackCodec[] = ['auto', 'mp4', 'mp4hls'];

/**
 * Which events Prev / Next on the detail page walk through when the URL
 * carries no list context. Written by the events list whenever its monitor
 * filter changes: a monitor id, or `null` for "every monitor". Before the
 * list has ever been visited the scope is unset and the detail page falls
 * back to the event's own monitor.
 */
export interface EventNavScope {
  monitorId: number | null;
  /** An explicit set (legacy `Id =[] …` from the list's View action). */
  ids?: number[];
  /** Start playing on arrival (legacy `play=1`). */
  autoplay?: boolean;
}

interface EventPlaybackState {
  replayMode: ReplayMode;
  scaleByMonitor: Record<number, PlaybackScale>;
  showZones: boolean;
  showStats: boolean;
  /** One of `PLAYBACK_RATES`. */
  rate: number;
  codec: PlaybackCodec;
  navScope: EventNavScope | null;
  setReplayMode: (mode: ReplayMode) => void;
  setScale: (monitorId: number, scale: PlaybackScale) => void;
  setShowZones: (show: boolean) => void;
  setShowStats: (show: boolean) => void;
  setRate: (rate: number) => void;
  setCodec: (codec: PlaybackCodec) => void;
  setNavScope: (scope: EventNavScope) => void;
}

/**
 * Event-playback preferences. Persisted via sessionStorage so they
 * carry between events in the same tab but reset across browser
 * sessions — matches the legacy "set it for this debug session, don't
 * remember it forever" expectation.
 */
export const useEventPlaybackStore = create<EventPlaybackState>()(
  persist(
    (set) => ({
      replayMode: 'none',
      scaleByMonitor: {},
      showZones: false,
      // Legacy `zmEventStats` cookie defaults to on.
      showStats: true,
      rate: 1,
      codec: 'auto',
      navScope: null,
      setReplayMode: (mode) => set({ replayMode: REPLAY_MODES.includes(mode) ? mode : 'none' }),
      setScale: (monitorId, scale) =>
        set((s) => ({ scaleByMonitor: { ...s.scaleByMonitor, [monitorId]: scale } })),
      setShowZones: (show) => set({ showZones: show }),
      setShowStats: (show) => set({ showStats: show }),
      setRate: (rate) => set({ rate: PLAYBACK_RATES.includes(rate) ? rate : 1 }),
      setCodec: (codec) => set({ codec: PLAYBACK_CODECS.includes(codec) ? codec : 'auto' }),
      setNavScope: (scope) =>
        set((s) => (JSON.stringify(s.navScope) === JSON.stringify(scope) ? {} : { navScope: scope })),
    }),
    {
      name: 'zm-event-playback',
      storage: createJSONStorage(() => sessionStorage),
      // v1 changed the replay-mode, scale and rate value sets; a tab that
      // still holds v0 values starts from the defaults.
      version: 1,
      migrate: () => ({}) as EventPlaybackState,
    },
  ),
);

/**
 * The player frame's CSS `max-width` for a scale, given the recording's
 * pixel size. `fit_to_width` and Auto leave the frame to its column; the
 * pixel caps bound the long side (legacy `changeScale`: width for a
 * landscape recording, height for a portrait one).
 */
export function scaleToMaxWidth(scale: PlaybackScale, width: number, height: number): string | undefined {
  if (scale === '0' || scale === 'fit_to_width') return undefined;
  if (scale === '100') return `${width}px`;
  const cap = parseInt(scale, 10);
  if (!(width > 0 && height > 0)) return `${cap}px`;
  return width >= height ? `${cap}px` : `${Math.round((cap * width) / height)}px`;
}
