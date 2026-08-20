import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { ApiClientError } from '@/api/client';

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div>,
}));

const { AppCrashFallback, NotFoundFallback, RouteErrorFallback } = await import('./RouteFallbacks');

function makeRouter(initial: string, thrown: unknown = new Error('page broke')) {
  const root = createRootRoute({ component: () => <Outlet /> });
  const index = createRoute({ getParentRoute: () => root, path: '/', component: () => <p>home</p> });
  const broken = createRoute({
    getParentRoute: () => root,
    path: '/broken',
    component: () => {
      throw thrown;
    },
  });
  return createRouter({
    routeTree: root.addChildren([index, broken]),
    history: createMemoryHistory({ initialEntries: [initial] }),
    defaultErrorComponent: RouteErrorFallback,
    defaultNotFoundComponent: NotFoundFallback,
  });
}

describe('router fallbacks', () => {
  it('renders the error fallback inside the shell with retry and a home link', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const router = makeRouter('/broken');
    renderWithProviders(<RouterProvider router={router} />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('This page failed to load.'));
    expect(screen.getByTestId('shell')).toBeInTheDocument();
    expect(screen.getByText('page broke')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Go to console' }));
    await waitFor(() => expect(screen.getByText('home')).toBeInTheDocument());
    spy.mockRestore();
  });

  it('words a 403 as no permission and hides Retry', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const router = makeRouter('/broken', new ApiClientError('System:View required', 403));
    renderWithProviders(<RouterProvider router={router} />);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('You do not have permission to view this.'),
    );
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    spy.mockRestore();
  });

  it('renders the not-found fallback inside the shell', async () => {
    const router = makeRouter('/nowhere');
    renderWithProviders(<RouterProvider router={router} />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('There is no page at this address.'));
    expect(screen.getByTestId('shell')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to console' })).toBeInTheDocument();
  });

  it('AppCrashFallback offers try-again without router context', () => {
    const reset = vi.fn();
    renderWithProviders(<AppCrashFallback error={new Error('root died')} reset={reset} />);
    expect(screen.getByText('root died')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Go to console' })).toHaveAttribute('href', '/');
  });
});
