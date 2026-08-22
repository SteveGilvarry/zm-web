import { describe, expect, it } from 'vitest';
import { planRootNavigation } from './rootNavigation';

const authed = (pathname: string, searchString = '') =>
  planRootNavigation({ pathname, searchString, isAuthenticated: true });
const anon = (pathname: string, searchString = '') =>
  planRootNavigation({ pathname, searchString, isAuthenticated: false });

describe('planRootNavigation', () => {
  it('does nothing for an ordinary authenticated navigation', () => {
    expect(authed('/events', '?monitor_id=3')).toEqual({});
    expect(authed('/')).toEqual({});
  });

  it('reads and strips ?skin=', () => {
    expect(authed('/events', '?skin=classic')).toEqual({ skin: 'classic', href: '/events' });
    expect(authed('/events', '?skin=classic&monitor_id=3')).toEqual({
      skin: 'classic',
      href: '/events?monitor_id=3',
    });
    // Unknown skin ids are dropped from the URL but not applied.
    expect(authed('/', '?skin=neon')).toEqual({ href: '/' });
  });

  it('leaves ?lang= alone', () => {
    expect(authed('/', '?lang=he')).toEqual({});
  });

  it('rewrites legacy view URLs', () => {
    expect(authed('/', '?view=watch&mid=2')).toEqual({ href: '/monitors/2' });
    expect(authed('/index.php', '?view=event&eid=77')).toEqual({ href: '/events/77' });
    expect(authed('/', '?view=montagereview&MonitorId=1&minTime=a&maxTime=b')).toEqual({
      href: '/montagereview?max_time=b&min_time=a&monitor_id=1',
    });
  });

  it('applies skin and legacy rewrite together', () => {
    expect(authed('/', '?skin=classic&view=cycle&mid=3')).toEqual({
      skin: 'classic',
      href: '/cycle?monitor_id=3',
    });
  });

  it('bounces anonymous users to /login with a redirect back', () => {
    expect(anon('/')).toEqual({ href: '/login' });
    expect(anon('/events', '?monitor_id=3')).toEqual({
      href: '/login?redirect=%2Fevents%3Fmonitor_id%3D3',
    });
    expect(anon('/login')).toEqual({});
    expect(anon('/login', '?redirect=%2Fevents')).toEqual({});
  });

  it('resolves a legacy link before computing the redirect target', () => {
    expect(anon('/index.php', '?view=event&eid=77')).toEqual({
      href: '/login?redirect=%2Fevents%2F77',
    });
    expect(anon('/', '?view=logout')).toEqual({ href: '/login' });
  });

  it('still records the skin when bouncing to login', () => {
    expect(anon('/events', '?skin=classic')).toEqual({
      skin: 'classic',
      href: '/login?redirect=%2Fevents',
    });
  });
});
