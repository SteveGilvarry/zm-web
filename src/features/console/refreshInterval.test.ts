import { describe, expect, it } from 'vitest';
import { consoleRefreshInterval } from './refreshInterval';

describe('consoleRefreshInterval', () => {
  it('converts the configured seconds to milliseconds', () => {
    expect(consoleRefreshInterval('240', 30_000)).toBe(240_000);
    expect(consoleRefreshInterval('5', 30_000)).toBe(5_000);
  });

  it('treats 0 as "never refresh", the way legacy arms its timer', () => {
    expect(consoleRefreshInterval('0', 30_000)).toBe(false);
  });

  it('keeps the dashboard cadence when the row is absent or blank', () => {
    expect(consoleRefreshInterval(undefined, 30_000)).toBe(30_000);
    expect(consoleRefreshInterval('', 60_000)).toBe(60_000);
    expect(consoleRefreshInterval('   ', 60_000)).toBe(60_000);
  });

  it('ignores junk and negative values rather than disabling refresh', () => {
    expect(consoleRefreshInterval('soon', 30_000)).toBe(30_000);
    expect(consoleRefreshInterval('-10', 30_000)).toBe(30_000);
  });

  it('accepts a fractional value', () => {
    expect(consoleRefreshInterval('2.5', 30_000)).toBe(2_500);
  });
});
