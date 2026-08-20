import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Replay mode controls what happens at the end of an event.
 *
 *  - `single`  — stop at the end of the event.
 *  - `all`     — auto-advance to the next event in the same listing.
 *  - `gapless` — like `all` but skips the inter-event gap so consecutive
 *                events play back-to-back.
 *
 * Legacy ZoneMinder also had a `none` option (single playback then idle);
 * we treat `single` as equivalent here so the four-mode dropdown collapses
 * to three.
 */
export type ReplayMode = 'single' | 'all' | 'gapless';

/**
 * Scale options for the event player.
 *
 * `auto` uses the camera's natural aspect ratio to fill the available
 * width (today's default). The percentage modes constrain the video
 * container's max-width so an operator can pin a portrait camera to a
 * smaller frame instead of having it dominate the layout.
 */
export type PlaybackScale = 'auto' | '25' | '50' | '75' | '100' | '150' | '200';

export const SCALE_OPTIONS: ReadonlyArray<{ value: PlaybackScale; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: '25',   label: '25%' },
  { value: '50',   label: '50%' },
  { value: '75',   label: '75%' },
  { value: '100',  label: '100%' },
  { value: '150',  label: '150%' },
  { value: '200',  label: '200%' },
];

export const REPLAY_MODE_OPTIONS: ReadonlyArray<{ value: ReplayMode; label: string }> = [
  { value: 'single',  label: 'Single' },
  { value: 'all',     label: 'All' },
  { value: 'gapless', label: 'Gapless' },
];

/** Playback speeds offered by the event player (legacy: 1/4× … 16×). */
export const PLAYBACK_RATES: readonly number[] = [0.25, 0.5, 1, 2, 4, 8, 16];

/**
 * Which events Prev / Next on the detail page walk through. Written by the
 * events list whenever its monitor filter changes: a monitor id, or `null`
 * for "every monitor". Before the list has ever been visited the scope is
 * unset and the detail page falls back to the event's own monitor.
 */
export interface EventNavScope {
  monitorId: number | null;
}

interface EventPlaybackState {
  replayMode: ReplayMode;
  scale: PlaybackScale;
  showZones: boolean;
  showStats: boolean;
  /** `HTMLMediaElement.playbackRate`; one of `PLAYBACK_RATES`. */
  rate: number;
  navScope: EventNavScope | null;
  setReplayMode: (mode: ReplayMode) => void;
  setScale: (scale: PlaybackScale) => void;
  setShowZones: (show: boolean) => void;
  setShowStats: (show: boolean) => void;
  setRate: (rate: number) => void;
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
      replayMode: 'single',
      scale: 'auto',
      showZones: false,
      showStats: false,
      rate: 1,
      navScope: null,
      setReplayMode: (mode) => set({ replayMode: mode }),
      setScale: (scale) => set({ scale }),
      setShowZones: (show) => set({ showZones: show }),
      setShowStats: (show) => set({ showStats: show }),
      setRate: (rate) => set({ rate: PLAYBACK_RATES.includes(rate) ? rate : 1 }),
      setNavScope: (scope) =>
        set((s) => (s.navScope?.monitorId === scope.monitorId ? {} : { navScope: scope })),
    }),
    {
      name: 'zm-event-playback',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);

/** Convert a `PlaybackScale` to an inline CSS `maxWidth` value. */
export function scaleToMaxWidth(scale: PlaybackScale): string | undefined {
  if (scale === 'auto') return undefined;
  // Each percentage step roughly corresponds to a fraction of a "natural"
  // 1280px reference width — this gives `100% ≈ 1280px`, with the others
  // proportional. Operators rarely need pixel precision here; the goal
  // is a visible difference between 50% and 100%.
  const ref = 1280;
  const pct = Number(scale);
  return `${Math.round((ref * pct) / 100)}px`;
}
