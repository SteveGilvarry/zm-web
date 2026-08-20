import { describe, expect, it } from 'vitest';
import { redirectParamFor, safeRedirectTarget } from './redirect';

describe('safeRedirectTarget', () => {
  it('accepts in-app paths with search', () => {
    expect(safeRedirectTarget('/events?monitor_id=3')).toBe('/events?monitor_id=3');
    expect(safeRedirectTarget('/monitors/4')).toBe('/monitors/4');
  });
  it('rejects external and malformed values', () => {
    expect(safeRedirectTarget('https://evil.example/')).toBeNull();
    expect(safeRedirectTarget('//evil.example/')).toBeNull();
    expect(safeRedirectTarget('/\\evil.example')).toBeNull();
    expect(safeRedirectTarget('events')).toBeNull();
    expect(safeRedirectTarget(undefined)).toBeNull();
    expect(safeRedirectTarget(3)).toBeNull();
  });
  it('rejects the login page itself (no redirect loops)', () => {
    expect(safeRedirectTarget('/login')).toBeNull();
    expect(safeRedirectTarget('/login?redirect=%2F')).toBeNull();
    expect(safeRedirectTarget('/loginx')).toBe('/loginx');
  });
});

describe('redirectParamFor', () => {
  it('omits the param for the console', () => {
    expect(redirectParamFor('/', '')).toBeUndefined();
  });
  it('keeps path and search', () => {
    expect(redirectParamFor('/events', '?monitor_id=3')).toBe('/events?monitor_id=3');
    expect(redirectParamFor('/events', 'monitor_id=3')).toBe('/events?monitor_id=3');
    expect(redirectParamFor('/logs', '')).toBe('/logs');
  });
});
