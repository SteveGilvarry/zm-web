import { describe, expect, it } from 'vitest';
import { mapLegacyUrl, targetHref } from './legacyUrl';

const map = (qs: string, path = '/') => mapLegacyUrl(path, qs);

describe('mapLegacyUrl', () => {
  it('returns null for non-legacy URLs', () => {
    expect(map('')).toBeNull();
    expect(map('?skin=classic')).toBeNull();
    expect(map('?monitor_id=3', '/events')).toBeNull();
  });

  it('sends a bare index.php to the console', () => {
    expect(map('', '/index.php')).toEqual({ to: '/', search: {} });
    expect(map('', '/zm/index.php')).toEqual({ to: '/', search: {} });
    expect(map('?view=nonsense', '/index.php')).toEqual({ to: '/', search: {} });
    expect(map('?view=nonsense', '/')).toBeNull();
  });

  it('maps watch / monitor / zones', () => {
    expect(map('?view=watch&mid=4')).toEqual({ to: '/monitors/4', search: {} });
    expect(map('?view=monitor&mid=4')).toEqual({ to: '/monitors/4', search: { edit: true } });
    expect(map('?view=monitor')).toEqual({ to: '/monitors', search: { new: true } });
    expect(map('?view=zones&mid=4')).toEqual({ to: '/monitors/4/zones', search: {} });
    expect(map('?view=watch&mid=abc')).toEqual({ to: '/monitors', search: {} });
  });

  it('maps event links (emailed %EPS% form)', () => {
    expect(map('?view=event&eid=1234')).toEqual({ to: '/events/1234', search: {} });
    expect(map('?view=frames&eid=1234')).toEqual({ to: '/events/1234', search: {} });
    expect(map('?view=event')).toEqual({ to: '/events', search: {} });
  });

  it('maps the events list and carries over MonitorId / Archived terms only', () => {
    expect(map('?view=events')).toEqual({ to: '/events', search: {} });
    expect(
      map(
        '?view=events&filter[Query][terms][0][attr]=MonitorId&filter[Query][terms][0][op]=%3D&filter[Query][terms][0][val]=3' +
          '&filter[Query][terms][1][cnj]=and&filter[Query][terms][1][attr]=Archived&filter[Query][terms][1][op]=%3D&filter[Query][terms][1][val]=1',
      ),
    ).toEqual({ to: '/events', search: { monitor_id: 3, archived: true } });
    // A term the dashboard cannot express is dropped, not mis-mapped.
    expect(
      map('?view=events&filter[Query][terms][0][attr]=StartDateTime&filter[Query][terms][0][op]=>%3D&filter[Query][terms][0][val]=-1+hour'),
    ).toEqual({ to: '/events', search: {} });
    expect(
      map('?view=events&filter[Query][terms][0][attr]=MonitorId&filter[Query][terms][0][op]=!%3D&filter[Query][terms][0][val]=3'),
    ).toEqual({ to: '/events', search: {} });
  });

  it('maps montage, montagereview, cycle', () => {
    expect(map('?view=montage')).toEqual({ to: '/montage', search: {} });
    expect(map('?view=montage&group=2')).toEqual({ to: '/montage', search: { group: 2 } });
    expect(
      map('?view=montagereview&MonitorId=5&minTime=2026-08-01T00:00:00&maxTime=2026-08-02T00:00:00'),
    ).toEqual({
      to: '/montagereview',
      search: { monitor_id: 5, min_time: '2026-08-01T00:00:00', max_time: '2026-08-02T00:00:00' },
    });
    expect(map('?view=cycle&mid=2')).toEqual({ to: '/cycle', search: { monitor_id: 2 } });
    expect(map('?view=cycle')).toEqual({ to: '/cycle', search: {} });
  });

  it('maps options tabs to settings sub-pages', () => {
    expect(map('?view=options')).toEqual({ to: '/settings', search: {} });
    expect(map('?view=options&tab=users')).toEqual({ to: '/settings/users', search: {} });
    expect(map('?view=options&tab=servers')).toEqual({ to: '/settings/servers', search: {} });
    expect(map('?view=options&tab=storage')).toEqual({ to: '/settings/storage', search: {} });
    expect(map('?view=options&tab=control')).toEqual({ to: '/settings/ptz-controls', search: {} });
    expect(map('?view=options&tab=privacy')).toEqual({ to: '/settings', search: { tab: 'privacy' } });
    expect(map('?view=state')).toEqual({ to: '/settings/state', search: {} });
    expect(map('?view=user&uid=7')).toEqual({ to: '/settings/users', search: { uid: 7 } });
    expect(map('?view=controlcaps')).toEqual({ to: '/settings/ptz-controls', search: {} });
  });

  it('maps filters, logs, groups, reports, audit, console', () => {
    expect(map('?view=filter&Id=9')).toEqual({ to: '/filters', search: { id: 9 } });
    expect(map('?view=filter')).toEqual({ to: '/filters', search: {} });
    expect(map('?view=log')).toEqual({ to: '/logs', search: {} });
    expect(map('?view=groups')).toEqual({ to: '/groups', search: {} });
    expect(map('?view=reports')).toEqual({ to: '/reports', search: {} });
    expect(map('?view=report&id=3')).toEqual({ to: '/reports/3', search: {} });
    expect(map('?view=report_event_audit')).toEqual({ to: '/audit', search: {} });
    expect(map('?view=console')).toEqual({ to: '/', search: {} });
    expect(map('?view=logout')).toEqual({ to: '/login', search: {} });
  });
});

describe('targetHref', () => {
  it('serialises with sorted keys and no trailing ?', () => {
    expect(targetHref({ to: '/events', search: {} })).toBe('/events');
    expect(targetHref({ to: '/events', search: { monitor_id: 3, archived: true } })).toBe(
      '/events?archived=true&monitor_id=3',
    );
  });
});
