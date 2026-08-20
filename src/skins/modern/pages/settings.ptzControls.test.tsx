import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const { default: PtzControlsPage } = await import('./settings.ptzControls');

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

function seedControls(items: unknown[]) {
  server.use(
    http.get('/api/v3/controls', () => HttpResponse.json({
      items, total: items.length, per_page: 200, current_page: 1, last_page: 1,
    })),
  );
}

describe('PTZ controls page', () => {
  it('lists protocols with a capability summary', async () => {
    seedControls([
      { id: 1, name: 'ONVIF', type: 'Ffmpeg', can_pan: 1, can_tilt: 1, can_zoom: 1, has_presets: 1, num_presets: 8 },
      { id: 2, name: 'Fixed', type: 'Local' },
    ]);
    renderWithProviders(<PtzControlsPage />);
    await waitFor(() => expect(screen.getByText('ONVIF')).toBeInTheDocument());
    expect(screen.getByText('Pan/Tilt · Zoom · Presets (8)')).toBeInTheDocument();
    expect(screen.getByText('View only')).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    seedControls([]);
    renderWithProviders(<PtzControlsPage />);
    await waitFor(() =>
      expect(screen.getByText(/No PTZ control protocols defined/)).toBeInTheDocument(),
    );
  });

  it('confirms then DELETEs /controls/{id}', async () => {
    seedControls([{ id: 7, name: 'Axis', type: 'Remote' }]);
    let deleted = 0;
    server.use(
      http.delete('/api/v3/controls/7', () => {
        deleted += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<PtzControlsPage />);
    await waitFor(() => expect(screen.getByText('Axis')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Delete Axis' }));
    expect(screen.getByRole('dialog', { name: /confirm delete/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(deleted).toBe(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
