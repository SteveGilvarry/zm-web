import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoaderCallbacks, LoaderConfiguration, LoaderContext } from 'hls.js';
import { noteRateLimited, reserveRateLimitSlot, resetRateLimitGate } from '@/api/client';
import { gatedLoader } from './gatedHlsLoader';

/**
 * hls.js fetches playlists and segments through its own loader, outside the
 * API client's 429 gate. The gated loader puts those fetches behind the same
 * gate: a load waits out a penalty the client already knows about, and a 429
 * it sees itself closes the gate for everyone.
 */

const calls: string[] = [];
class FakeBase {
  constructor() { calls.push('new'); }
  load(...args: unknown[]) { void args; calls.push('load'); }
  abort() { calls.push('abort'); }
  destroy() { calls.push('destroy'); }
}
const Gated = gatedLoader(FakeBase as never);
const ctx = { url: 'u', responseType: 'text' } as LoaderContext;
const cfg = {} as LoaderConfiguration;
const callbacks = () => ({ onSuccess: vi.fn(), onError: vi.fn(), onTimeout: vi.fn() }) as unknown as LoaderCallbacks<LoaderContext>;

beforeEach(() => { calls.length = 0; resetRateLimitGate(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); resetRateLimitGate(); });

describe('gatedLoader', () => {
  it('loads at once when the gate is open', () => {
    new Gated({} as never).load(ctx, cfg, callbacks());
    expect(calls).toEqual(['new', 'load']);
  });

  it('waits for a penalty the API client already knows about', () => {
    noteRateLimited(3000);
    new Gated({} as never).load(ctx, cfg, callbacks());
    expect(calls).toEqual(['new']);
    vi.advanceTimersByTime(2900);
    expect(calls).toEqual(['new']);
    vi.advanceTimersByTime(200);
    expect(calls).toEqual(['new', 'load']);
  });

  it('a 429 it sees closes the gate for the whole client and still reaches hls.js', () => {
    let seen: LoaderCallbacks<LoaderContext> | undefined;
    class Capture extends FakeBase {
      load(c: LoaderContext, g: LoaderConfiguration, cb: LoaderCallbacks<LoaderContext>) { super.load(c, g, cb); seen = cb; }
    }
    const cbs = callbacks();
    new (gatedLoader(Capture as never))({} as never).load(ctx, cfg, cbs);
    const xhr = { getResponseHeader: (h: string) => (h === 'retry-after' ? '4' : null) };
    seen!.onError({ code: 429, text: 'Too Many Requests' }, ctx, xhr as never, {} as never);
    expect(reserveRateLimitSlot()).toBeGreaterThanOrEqual(3900);
    expect(cbs.onError).toHaveBeenCalledTimes(1);
  });

  it('abort while waiting cancels the pending load', () => {
    noteRateLimited(3000);
    const l = new Gated({} as never);
    l.load(ctx, cfg, callbacks());
    l.abort();
    vi.advanceTimersByTime(5000);
    expect(calls).toEqual(['new', 'abort']);
  });
});
