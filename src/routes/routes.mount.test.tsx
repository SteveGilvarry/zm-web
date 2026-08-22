/**
 * Every route, mounted through the real router.
 *
 * The route files are one-liners, which is exactly why they used to sit at
 * 0% coverage: nothing imported them. They are also where a rename or a
 * `validateSearch` typo silently sends an operator to a 404. This file walks
 * the whole route table, renders each URL in the modern skin and checks the
 * page it was supposed to reach actually painted inside the shell.
 */
import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';

import { createMemoryHistory, createRouter } from '@tanstack/react-router';

import { renderRoute } from '@/test/renderRoute';
import { setupMockServer } from '@/test/msw/server';
import { routeTree } from '@/routeTree.gen';

setupMockServer();

/** A URL per route, with the heading the modern skin puts in the header. */
const ROUTES: Array<{ id: string; path: string; heading: RegExp; anonymous?: true }> = [
  { id: '/', path: '/', heading: /^Console$/ },
  // Signed in, /login sends you straight back to the console, so this one
  // route is rendered anonymously.
  { id: '/login', path: '/login', heading: /^ZM/, anonymous: true },
  { id: '/audit/', path: '/audit', heading: /^Audit Events Report$/ },
  { id: '/cycle/', path: '/cycle', heading: /^Cycle$/ },
  { id: '/events/', path: '/events', heading: /^Events$/ },
  { id: '/events/$eventId', path: '/events/101', heading: /^Event-101$/ },
  { id: '/events/$eventId_/frames', path: '/events/101/frames', heading: /Frames/ },
  { id: '/filters/', path: '/filters', heading: /^Filters$/ },
  { id: '/groups/', path: '/groups', heading: /^Groups$/ },
  { id: '/logs/', path: '/logs', heading: /^Log$/ },
  { id: '/monitors/', path: '/monitors', heading: /^Monitors$/ },
  { id: '/monitors/$monitorId', path: '/monitors/1', heading: /^Front Door$/ },
  { id: '/monitors/$monitorId_/zones', path: '/monitors/1/zones', heading: /^Zones$/ },
  { id: '/montage/', path: '/montage', heading: /^Montage$/ },
  { id: '/montagereview/', path: '/montagereview', heading: /^Montage Review$/ },
  { id: '/reports/', path: '/reports', heading: /^Reports$/ },
  { id: '/reports/$reportId', path: '/reports/1', heading: /^Report$/ },
  { id: '/settings/', path: '/settings', heading: /^System Settings$/ },
  { id: '/settings/ptz-controls', path: '/settings/ptz-controls', heading: /^PTZ control profiles$/ },
  { id: '/settings/servers', path: '/settings/servers', heading: /^Servers$/ },
  { id: '/settings/state', path: '/settings/state', heading: /^Run State$/ },
  { id: '/settings/storage', path: '/settings/storage', heading: /^Storage Management$/ },
  { id: '/settings/users', path: '/settings/users', heading: /^User Management$/ },
];

describe('route table', () => {
  it('covers every route in routeTree.gen', () => {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    });
    const ids = Object.keys(router.routesById).filter((id) => id !== '__root__');
    expect(ids.sort()).toEqual(ROUTES.map((r) => r.id).sort());
  });

  it.each(ROUTES)('$path renders its page in the shell', async ({ path, heading, anonymous }) => {
    const { router } = renderRoute(path, { authenticated: !anonymous });
    // Several pages repeat the header title as a panel heading, so match all.
    expect((await screen.findAllByRole('heading', { name: heading })).length).toBeGreaterThan(0);
    expect(router.state.location.pathname).toBe(path);
  }, 20_000);
});

describe('modern shell', () => {
  it('wraps pages in the sidebar nav and header', async () => {
    renderRoute('/groups');
    await screen.findAllByRole('heading', { name: /^Groups$/ });

    const nav = screen.getByRole('navigation');
    expect(within(nav).getByRole('link', { name: /console/i })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: /^events$/i })).toHaveAttribute('href', '/events');
    // Nav is grouped by task rather than being one flat list of links.
    expect(within(nav).getByRole('heading', { name: 'Watch', level: 2 })).toBeInTheDocument();
    expect(within(nav).getByRole('heading', { name: 'Investigate', level: 2 })).toBeInTheDocument();
    // The header carries the clock and the version — the system readings
    // belong to the console, not to the chrome above every page.
    expect(await screen.findByText(/^\d{2}:\d{2}:\d{2}$/)).toBeInTheDocument();
  });

  it('renders the classic top nav instead when the classic skin is active', async () => {
    renderRoute('/groups', { skin: 'classic' });
    await screen.findByRole('link', { name: /^Console$/ });
    expect(document.documentElement.dataset.skin).toBe('classic');
  });

  it('puts the skin class on <html> and swaps it when the skin changes', async () => {
    const modern = renderRoute('/groups');
    await screen.findAllByRole('heading', { name: /^Groups$/ });
    expect(document.documentElement).toHaveClass('skin-modern');
    modern.unmount();

    renderRoute('/groups', { skin: 'classic' });
    await screen.findByRole('link', { name: /^Console$/ });
    expect(document.documentElement).toHaveClass('skin-classic');
    expect(document.documentElement).not.toHaveClass('skin-modern');
  });
});
