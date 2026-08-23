import { describe, expect, it } from 'vitest';
import {
  ApiClientError, classifyApiError, parseRetryAfter, retryDelayForError, shouldRetryQuery,
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

  it('waits as long as the server asked', () => {
    const err = new ApiClientError('slow down', 429, undefined, 4000);
    expect(retryDelayForError(0, err)).toBe(4000);
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
