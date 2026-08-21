/**
 * What the root route decides before a page renders, exercised through the
 * real router rather than against `planRootNavigation` in isolation: the
 * login guard, legacy `index.php?view=…` rewrites, `?skin=`, and the
 * `validateSearch` round-trip on every route that takes search params.
 */
import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';

import { renderRoute } from '@/test/renderRoute';
import { setupMockServer } from '@/test/msw/server';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

setupMockServer();

describe('login guard', () => {
  it('bounces an anonymous visitor to /login carrying where they were going', async () => {
    const { router } = renderRoute('/events?monitor_id=3', { authenticated: false });
    await screen.findByRole('button', { name: /sign in/i });
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toMatchObject({ redirect: '/events?monitor_id=3' });
  });

  it('lets a signed-in operator through', async () => {
    const { router } = renderRoute('/events');
    await screen.findAllByRole('heading', { name: /^Events$/ });
    expect(router.state.location.pathname).toBe('/events');
  });

  it('bounces to /login when the session ends while a page is open', async () => {
    const { router } = renderRoute('/groups');
    await screen.findAllByRole('heading', { name: /^Groups$/ });

    useAuthStore.getState().clearAuth('expired');

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toMatchObject({ reason: 'expired' });
  });
});

describe('legacy URLs', () => {
  const CASES: Array<[legacy: string, pathname: string, search?: Record<string, unknown>]> = [
    ['/index.php?view=watch&mid=1', '/monitors/1'],
    ['/index.php?view=monitor&mid=2', '/monitors/2', { edit: true }],
    ['/index.php?view=zones&mid=1', '/monitors/1/zones'],
    ['/index.php?view=event&eid=101', '/events/101'],
    ['/index.php?view=console', '/'],
    ['/index.php?view=options&tab=users', '/settings/users'],
    ['/index.php?view=montagereview&MonitorId=2', '/montagereview', { monitor_id: 2 }],
  ];

  it.each(CASES)('%s resolves to %s', async (legacy, pathname, search) => {
    const { router } = renderRoute(legacy);
    await waitFor(() => expect(router.state.location.pathname).toBe(pathname));
    if (search) expect(router.state.location.search).toMatchObject(search);
  }, 20_000);

  it('sends a legacy events filter to the events list with the monitor preselected', async () => {
    const { router } = renderRoute(
      '/index.php?view=events&filter%5BQuery%5D%5Bterms%5D%5B0%5D%5Battr%5D=MonitorId' +
        '&filter%5BQuery%5D%5Bterms%5D%5B0%5D%5Bop%5D=%3D' +
        '&filter%5BQuery%5D%5Bterms%5D%5B0%5D%5Bval%5D=2',
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/events'));
    expect(router.state.location.search).toMatchObject({ monitor_id: 2 });
  });
});

describe('?skin=', () => {
  it('switches the skin once and strips itself from the URL', async () => {
    const { router } = renderRoute('/groups?skin=classic');
    await waitFor(() => expect(useUiStore.getState().skin).toBe('classic'));
    await waitFor(() => expect(router.state.location.searchStr).toBe(''));
    expect(router.state.location.pathname).toBe('/groups');
  });

  it('ignores a skin it does not know', async () => {
    renderRoute('/groups?skin=neon');
    await screen.findAllByRole('heading', { name: /^Groups$/ });
    expect(useUiStore.getState().skin).toBe('modern');
  });
});

describe('search params round-trip through validateSearch', () => {
  it('/events keeps monitor_id and sort', async () => {
    const { router } = renderRoute('/events?monitor_id=2&sort=id&direction=asc');
    await screen.findAllByRole('heading', { name: /^Events$/ });
    expect(router.state.location.search).toMatchObject({ monitor_id: 2 });
  });

  it('/filters opens the saved filter named in ?id=', async () => {
    const { router } = renderRoute('/filters?id=1');
    await screen.findAllByRole('heading', { name: /^Filters$/ });
    expect(router.state.location.search).toMatchObject({ id: 1 });
  });

  it('/filters drops a non-numeric ?id=', async () => {
    const { router } = renderRoute('/filters?id=abc');
    await screen.findAllByRole('heading', { name: /^Filters$/ });
    expect(router.state.location.search).not.toHaveProperty('id');
  });

  it('/monitors/$id?edit=true is coerced to a boolean', async () => {
    const { router } = renderRoute('/monitors/1?edit=true');
    await screen.findAllByRole('heading', { name: /^Front Door$/ });
    expect(router.state.location.search).toMatchObject({ edit: true });
  });

  it('/monitors?new=1 is coerced to a boolean', async () => {
    const { router } = renderRoute('/monitors?new=1');
    await screen.findAllByRole('heading', { name: /^Monitors$/ });
    expect(router.state.location.search).toMatchObject({ new: true });
  });

  it('/montagereview keeps monitor_id plus the legacy time window', async () => {
    const { router } = renderRoute(
      '/montagereview?monitor_id=2&min_time=2026-08-21%2008%3A00%3A00&max_time=2026-08-21%2009%3A00%3A00',
    );
    await screen.findAllByRole('heading', { name: /^Montage Review$/ });
    expect(router.state.location.search).toMatchObject({
      monitor_id: 2,
      min_time: '2026-08-21 08:00:00',
      max_time: '2026-08-21 09:00:00',
    });
  });

  it('/montagereview rejects a zero monitor_id', async () => {
    const { router } = renderRoute('/montagereview?monitor_id=0');
    await screen.findAllByRole('heading', { name: /^Montage Review$/ });
    expect(router.state.location.search).not.toHaveProperty('monitor_id');
  });

  it('/logs keeps its component and numeric level filters', async () => {
    const { router } = renderRoute('/logs?component=zmc_m1&level=-2&page=2');
    await screen.findAllByRole('heading', { name: /^Log$/ });
    expect(router.state.location.search).toMatchObject({
      component: 'zmc_m1',
      level: -2,
      page: 2,
    });
  });
});
