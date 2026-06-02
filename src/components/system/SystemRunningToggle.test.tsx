import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { SystemRunningToggle } from './SystemRunningToggle';
import { useAuthStore } from '@/stores/auth';

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'warn' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

describe('SystemRunningToggle — display', () => {
  it("shows 'RUNNING' in emerald when status.running is true", async () => {
    server.use(http.get('/api/v3/system/status', () => HttpResponse.json({
      running: true, daemons: [], stats: {},
    })));
    renderWithProviders(<SystemRunningToggle />);
    await waitFor(() => expect(screen.getByText(/^running$/i)).toBeInTheDocument());
  });

  it("shows 'STOPPED' when status.running is false", async () => {
    server.use(http.get('/api/v3/system/status', () => HttpResponse.json({
      running: false, daemons: [], stats: {},
    })));
    renderWithProviders(<SystemRunningToggle />);
    await waitFor(() => expect(screen.getByText(/^stopped$/i)).toBeInTheDocument());
  });
});

describe('SystemRunningToggle — start', () => {
  it('hits /system/startup when toggled from stopped', async () => {
    const user = userEvent.setup();
    let startupHits = 0;
    server.use(
      http.get('/api/v3/system/status', () => HttpResponse.json({
        running: false, daemons: [], stats: {},
      })),
      http.post('/api/v3/system/startup', () => {
        startupHits += 1;
        return HttpResponse.json({});
      }),
    );

    renderWithProviders(<SystemRunningToggle />);
    await waitFor(() => screen.getByText(/^stopped$/i));
    await user.click(screen.getByRole('button', { name: /start zoneminder/i }));
    await waitFor(() => expect(startupHits).toBe(1));
  });
});

describe('SystemRunningToggle — stop', () => {
  it('confirms before stopping a running system; respects decline', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    let shutdownHits = 0;
    server.use(
      http.get('/api/v3/system/status', () => HttpResponse.json({
        running: true, daemons: [], stats: {},
      })),
      http.post('/api/v3/system/shutdown', () => {
        shutdownHits += 1;
        return HttpResponse.json({});
      }),
    );

    renderWithProviders(<SystemRunningToggle />);
    await waitFor(() => screen.getByText(/^running$/i));
    await user.click(screen.getByRole('button', { name: /stop zoneminder/i }));

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(shutdownHits).toBe(0);
    confirmSpy.mockRestore();
  });

  it('proceeds to /system/shutdown on confirm accept', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let shutdownHits = 0;
    server.use(
      http.get('/api/v3/system/status', () => HttpResponse.json({
        running: true, daemons: [], stats: {},
      })),
      http.post('/api/v3/system/shutdown', () => {
        shutdownHits += 1;
        return HttpResponse.json({});
      }),
    );

    renderWithProviders(<SystemRunningToggle />);
    await waitFor(() => screen.getByText(/^running$/i));
    await user.click(screen.getByRole('button', { name: /stop zoneminder/i }));
    await waitFor(() => expect(shutdownHits).toBe(1));
    confirmSpy.mockRestore();
  });
});
