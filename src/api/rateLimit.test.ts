import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiClientError, classifyApiError, parseRetryAfter, retryDelayForError, shouldRetryQuery,
  apiGet, noteRateLimited, reserveRateLimitSlot, resetRateLimitGate,
  MIN_RATE_LIMIT_WAIT_MS, RATE_LIMIT_COOLDOWN_MS, RATE_LIMIT_RELEASE_SPACING_MS,
} from './client';

/**
 * zm-api rate-limits and answers 429 with `Retry-After: 4` (and an
 * `X-RateLimit-After` alias). Observed on the reference box: a single page
 * load after rapid navigation gets 429 on every request, and recovers.
 *
 * A 429 is the one 4xx that does get better by asking again, so it must not
 * be lumped in with 403/422 and failed outright — that turns a few seconds'
 * pause into an error page with a Retry button.
 */
describe('429 handling', () => {
  it('classifies 429 apart from other client errors', () => {
    expect(classifyApiError(new ApiClientError('slow down', 429))).toBe('rate_limited');
    expect(classifyApiError(new ApiClientError('nope', 422))).toBe('client');
  });

  it('retries a 429 but still refuses other 4xx', () => {
    expect(shouldRetryQuery(0, new ApiClientError('slow down', 429))).toBe(true);
    expect(shouldRetryQuery(0, new ApiClientError('nope', 422))).toBe(false);
    expect(shouldRetryQuery(0, new ApiClientError('forbidden', 403))).toBe(false);
  });

  it('gives up after the retry budget, so it cannot loop forever', () => {
    expect(shouldRetryQuery(2, new ApiClientError('slow down', 429))).toBe(false);
  });

  it('waits as long as the server asked, and at least a second', () => {
    const err = new ApiClientError('slow down', 429, undefined, 4000);
    expect(retryDelayForError(0, err)).toBe(4000);
    // The box answers `retry-after: 0` when the next token is under a second
    // away; coming straight back is how one 429 becomes a stream of them.
    expect(retryDelayForError(0, new ApiClientError('x', 429, undefined, 0))).toBe(MIN_RATE_LIMIT_WAIT_MS);
    // Never longer than half a minute, however large the header.
    expect(retryDelayForError(0, new ApiClientError('x', 429, undefined, 600_000))).toBe(30_000);
  });

  it('backs off exponentially when the server said nothing', () => {
    const err = new ApiClientError('boom', 503);
    expect(retryDelayForError(0, err)).toBe(1000);
    expect(retryDelayForError(1, err)).toBe(2000);
    expect(retryDelayForError(9, err)).toBe(30_000);
  });
});

describe('parseRetryAfter', () => {
  it('reads the seconds form zm-api sends', () => {
    expect(parseRetryAfter('4')).toBe(4000);
    expect(parseRetryAfter(' 0 ')).toBe(0);
  });

  it('reads the HTTP-date form a proxy may substitute', () => {
    const now = Date.parse('2026-08-23T10:00:00Z');
    expect(parseRetryAfter('Sun, 23 Aug 2026 10:00:05 GMT', now)).toBe(5000);
    // A date already past means "now", not a negative wait.
    expect(parseRetryAfter('Sun, 23 Aug 2026 09:59:00 GMT', now)).toBe(0);
  });

  it('is undefined when absent or unparseable', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('soon')).toBeUndefined();
  });
});

/**
 * The gate is per client, like the limiter it answers: one 429 holds every
 * request, and the reopening is spaced so a page does not fire all of its
 * queries at a bucket that just refused one.
 */
describe('rate-limit gate', () => {
  beforeEach(() => resetRateLimitGate());
  afterEach(() => { resetRateLimitGate(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('lets requests through untouched when nothing has been refused', () => {
    expect(reserveRateLimitSlot(1000)).toBe(0);
    expect(reserveRateLimitSlot(1001)).toBe(0);
  });

  it('holds every caller for Retry-After after one 429, then spaces them out', () => {
    noteRateLimited(4000, 10_000);
    expect(reserveRateLimitSlot(10_000)).toBe(4000);
    expect(reserveRateLimitSlot(10_000)).toBe(4000 + RATE_LIMIT_RELEASE_SPACING_MS);
    expect(reserveRateLimitSlot(10_000)).toBe(4000 + 2 * RATE_LIMIT_RELEASE_SPACING_MS);
  });

  it('never waits less than a second, whatever the header said', () => {
    noteRateLimited(0, 10_000);
    expect(reserveRateLimitSlot(10_000)).toBe(MIN_RATE_LIMIT_WAIT_MS);
  });

  it('keeps the later of two deadlines', () => {
    noteRateLimited(5000, 10_000);
    noteRateLimited(1000, 11_000);
    expect(reserveRateLimitSlot(11_000)).toBe(4000);
  });

  it('stops spacing once the cool-down has passed', () => {
    noteRateLimited(1000, 10_000);
    const later = 10_000 + RATE_LIMIT_COOLDOWN_MS;
    expect(reserveRateLimitSlot(later)).toBe(0);
    expect(reserveRateLimitSlot(later)).toBe(0);
  });

  it('delays the actual fetch after a 429 came back', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(50_000);
    const sent: number[] = [];
    const fetchMock = vi.fn(async () => {
      sent.push(Date.now());
      if (sent.length === 1) {
        return new Response('{"error_message":"slow down"}', { status: 429, headers: { 'retry-after': '3' } });
      }
      return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiGet('/system/status')).rejects.toMatchObject({ status: 429 });

    const second = apiGet('/system/status');
    // Nothing goes out until the three seconds the server asked for are up.
    await vi.advanceTimersByTimeAsync(2999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(second).resolves.toEqual({ ok: true });
    expect(sent[1] - sent[0]).toBe(3000);
  });
});
