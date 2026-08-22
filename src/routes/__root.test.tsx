import {
  createMemoryHistory,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { Route as rootRoute } from './__root';

function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'none' })}.${b64(payload)}.sig`;
}

function makeRouter(initial: string) {
  const page = (name: string) =>
    function Page() {
      return <p>page:{name}</p>;
    };
  const login = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    validateSearch: (s: Record<string, unknown>) => ({
      redirect: typeof s.redirect === 'string' ? s.redirect : undefined,
    }),
    component: page('login'),
  });
  const index = createRoute({ getParentRoute: () => rootRoute, path: '/', component: page('console') });
  const events = createRoute({ getParentRoute: () => rootRoute, path: '/events', component: page('events') });
  const monitor = createRoute({
    getParentRoute: () => rootRoute,
    path: '/monitors/$monitorId',
    component: page('monitor'),
  });
  return createRouter({
    routeTree: rootRoute.addChildren([login, index, events, monitor]),
    history: createMemoryHistory({ initialEntries: [initial] }),
  });
}

const signIn = () =>
  useAuthStore
    .getState()
    .setTokens(jwt({ iat: 0, exp: Math.floor(Date.now() / 1000) + 600, user: 'admin', uid: 1 }), 'r');

beforeEach(() => {
  useAuthStore.getState().clearAuth();
  useUiStore.getState().setSkin('modern');
});

describe('root route — beforeLoad', () => {
  it('bounces an anonymous visitor to /login with a redirect back', async () => {
    const router = makeRouter('/events?monitor_id=3');
    renderWithProviders(<RouterProvider router={router} />);
    await waitFor(() => expect(screen.getByText('page:login')).toBeInTheDocument());
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toEqual({ redirect: '/events?monitor_id=3' });
  });

  it('lets a signed-in user through', async () => {
    signIn();
    const router = makeRouter('/events');
    renderWithProviders(<RouterProvider router={router} />);
    await waitFor(() => expect(screen.getByText('page:events')).toBeInTheDocument());
  });

  it('rewrites a legacy watch URL to the monitor route', async () => {
    signIn();
    const router = makeRouter('/index.php?view=watch&mid=4');
    renderWithProviders(<RouterProvider router={router} />);
    await waitFor(() => expect(screen.getByText('page:monitor')).toBeInTheDocument());
    expect(router.state.location.pathname).toBe('/monitors/4');
  });

  it('resolves a legacy link before asking for login', async () => {
    const router = makeRouter('/index.php?view=watch&mid=4');
    renderWithProviders(<RouterProvider router={router} />);
    await waitFor(() => expect(screen.getByText('page:login')).toBeInTheDocument());
    expect(router.state.location.search).toEqual({ redirect: '/monitors/4' });
  });

  it('applies and strips ?skin=', async () => {
    signIn();
    const router = makeRouter('/events?skin=classic');
    renderWithProviders(<RouterProvider router={router} />);
    await waitFor(() => expect(screen.getByText('page:events')).toBeInTheDocument());
    expect(useUiStore.getState().skin).toBe('classic');
    expect(router.state.location.search).toEqual({});
  });

  it('sends the user to login when the session ends mid-page', async () => {
    signIn();
    const router = makeRouter('/events');
    renderWithProviders(<RouterProvider router={router} />);
    await waitFor(() => expect(screen.getByText('page:events')).toBeInTheDocument());
    useAuthStore.getState().clearAuth();
    await waitFor(() => expect(screen.getByText('page:login')).toBeInTheDocument());
    expect(router.state.location.search).toEqual({ redirect: '/events' });
  });
});
