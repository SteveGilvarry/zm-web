/**
 * Concurrency budget for live tiles.
 *
 * Every console thumbnail, montage cell and review-live cell is a WebRTC or
 * HLS session on the backend. Viewport gating (`useInViewport`) already
 * keeps offscreen tiles dark; this module bounds what a large *visible*
 * wall opens at once. Tiles ask for a slot before starting and hand it back
 * when they stop, leave the viewport or unmount; tiles that were refused
 * re-ask whenever a slot frees (subscribers are notified on every change),
 * so the wall fills back in as others go dark.
 *
 * The limit itself lives in `useUiStore.maxLiveTiles`; `setLiveTileLimit`
 * is wired to it in `StreamCell`. Module-scoped on purpose: the budget is
 * per browser tab, like the WebRTC session manager.
 */

import { DEFAULT_MAX_LIVE_TILES } from '@/stores/ui';

const holders = new Map<string, number>(); // key → acquisition order
const listeners = new Set<() => void>();
let limit = DEFAULT_MAX_LIVE_TILES;
let seq = 0;
let version = 0;

function notify() {
  version += 1;
  for (const l of [...listeners]) l();
}

/** Try to take a slot. Idempotent for a key that already holds one. */
function request(key: string): boolean {
  if (holders.has(key)) return true;
  if (holders.size >= limit) return false;
  seq += 1;
  holders.set(key, seq);
  notify();
  return true;
}

function release(key: string) {
  if (!holders.delete(key)) return;
  notify();
}

function hasSlot(key: string): boolean {
  return holders.has(key);
}

function setLiveTileLimit(n: number) {
  const next = Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_MAX_LIVE_TILES;
  if (next === limit) return;
  limit = next;
  // Over budget after a lower cap: drop the most recent holders first so the
  // tiles the operator has looked at longest stay live.
  if (holders.size > limit) {
    const byAge = [...holders.entries()].sort((a, b) => b[1] - a[1]);
    for (const [key] of byAge.slice(0, holders.size - limit)) holders.delete(key);
  }
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Monotonic counter for useSyncExternalStore — changes on every mutation. */
function getVersion(): number {
  return version;
}

function snapshot() {
  return { used: holders.size, limit };
}

/** Test hook — forget every holder and restore the default limit. */
function reset() {
  holders.clear();
  limit = DEFAULT_MAX_LIVE_TILES;
  notify();
}

export const liveTileBudget = {
  request,
  release,
  hasSlot,
  setLiveTileLimit,
  subscribe,
  getVersion,
  snapshot,
  reset,
};
