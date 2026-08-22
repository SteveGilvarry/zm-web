import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// The editor target lives in `?id=`; stand in for the router with an
// in-memory search object so navigate() re-renders the page.
const mockSearch: { id?: number | 'new' } = {};
let rerenderPage: (() => void) | null = null;
const mockNavigate = vi.fn((opts: { search?: (prev: Record<string, unknown>) => Record<string, unknown> }) => {
  const next = opts.search?.({ ...mockSearch }) ?? {};
  delete mockSearch.id;
  if (next.id === 'new' || typeof next.id === 'number') mockSearch.id = next.id;
  rerenderPage?.();
});
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={to ?? '#'} {...rest}>{children}</a>
  ),
  useSearch: () => ({ ...mockSearch }),
  useNavigate: () => mockNavigate,
  useRouter: () => ({ history: { back: vi.fn() } }),
}));

const { default: PtzControlsPage } = await import('./settings.ptzControls');

function renderPage() {
  const r = renderWithProviders(<PtzControlsPage />);
  rerenderPage = () => r.rerender(<PtzControlsPage />);
  return r;
}

const server = setupServer();

beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: { iat: 0, exp: 4102444800, user: 'admin', uid: 1 }, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'warn' });
});
afterEach(() => {
  server.resetHandlers();
  delete mockSearch.id;
  rerenderPage = null;
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

function seedControls(items: unknown[], monitors: unknown[] = []) {
  server.use(
    http.get('/api/v3/controls', () => HttpResponse.json({
      items, total: items.length, per_page: 200, current_page: 1, last_page: 1,
    })),
    http.get('/api/v3/monitors', () => HttpResponse.json({
      items: monitors, total: monitors.length, per_page: 1000, current_page: 1, last_page: 1,
    })),
  );
}

describe('PTZ controls page', () => {
  it('lists protocols with a capability summary', async () => {
    seedControls([
      { id: 1, name: 'ONVIF', type: 'Ffmpeg', can_pan: 1, can_tilt: 1, can_zoom: 1, has_presets: 1, num_presets: 8 },
      { id: 2, name: 'Fixed', type: 'Local' },
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText('ONVIF')).toBeInTheDocument());
    expect(screen.getByText('Pan/Tilt · Zoom · Presets (8)')).toBeInTheDocument();
    expect(screen.getByText('View only')).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    seedControls([]);
    renderPage();
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
    renderPage();
    await waitFor(() => expect(screen.getByText('Axis')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Delete Axis' }));
    expect(screen.getByRole('dialog', { name: /confirm delete/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(deleted).toBe(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('PTZ controls page — editor and guards', () => {
  it('sorts by protocol and filters by search', async () => {
    seedControls([
      { id: 1, name: 'Bravo', type: 'Remote', protocol: 'ZZZ' },
      { id: 2, name: 'Alpha', type: 'Ffmpeg', protocol: 'AAA' },
    ]);
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    const names = () => screen.getAllByRole('row').slice(1).map((r) => r.querySelector('td:nth-child(2)')?.textContent);
    expect(names()).toEqual(['Alpha', 'Bravo']);
    await user.click(screen.getByRole('button', { name: /^protocol/i }));
    expect(names()).toEqual(['Alpha', 'Bravo']);
    await user.click(screen.getByRole('button', { name: /^protocol/i }));
    expect(names()).toEqual(['Bravo', 'Alpha']);
    await user.type(screen.getByRole('searchbox', { name: /search control profiles/i }), 'zzz');
    expect(names()).toEqual(['Bravo']);
  });

  it('Add profile opens the tabbed editor at ?id=new and POSTs every field', async () => {
    seedControls([]);
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/v3/controls', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 9, ...body }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText(/No PTZ control protocols defined/)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /add profile/i }));
    expect(mockSearch.id).toBe('new');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('tab', { name: 'Main' })).toHaveAttribute('aria-selected', 'true');
    await user.type(within(dialog).getByLabelText('Name'), 'e2e-probe-ptz');
    await user.type(within(dialog).getByLabelText('Protocol'), 'PelcoP');
    await user.click(within(dialog).getByRole('tab', { name: 'Pan' }));
    await user.click(within(dialog).getByLabelText('Can Pan'));
    await user.type(within(dialog).getByLabelText('Max Pan Speed'), '63');
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body!.name).toBe('e2e-probe-ptz');
    expect(body!.protocol).toBe('PelcoP');
    expect(body!.type).toBe('Local');
    expect(body!.can_pan).toBe(1);
    expect(body!.can_tilt).toBe(0);
    expect(body!.max_pan_speed).toBe(63);
    expect(body!.min_pan_speed).toBeNull();
    await waitFor(() => expect(mockSearch.id).toBeUndefined());
  });

  it('opens an existing profile from ?id= and PATCHes it', async () => {
    seedControls([{ id: 4, name: 'Axis', type: 'Remote', protocol: 'AxisV2', can_zoom: 1 }]);
    let patched: Record<string, unknown> | null = null;
    server.use(
      http.patch('/api/v3/controls/4', async ({ request }) => {
        patched = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 4, ...patched });
      }),
    );
    mockSearch.id = 4;
    const user = userEvent.setup();
    renderPage();
    const dialog = await screen.findByRole('dialog', { name: /Control Capability - Axis/ });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Axis');
    await user.click(within(dialog).getByRole('tab', { name: 'Zoom' }));
    expect(within(dialog).getByLabelText('Can Zoom')).toBeChecked();
    await user.click(within(dialog).getByLabelText('Can Zoom'));
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(patched).not.toBeNull());
    expect(patched!.can_zoom).toBe(0);
    expect(patched!.name).toBe('Axis');
  });

  it('refuses to delete a profile a monitor still references and lists the monitor', async () => {
    seedControls(
      [{ id: 7, name: 'Axis', type: 'Remote' }],
      [{ id: 11, name: 'Gate cam', control_id: 7 }, { id: 12, name: 'Other', control_id: null }],
    );
    let deleted = 0;
    server.use(http.delete('/api/v3/controls/7', () => { deleted += 1; return new HttpResponse(null, { status: 204 }); }));
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('Axis')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('1 monitor')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Delete Axis' }));
    const dialog = screen.getByRole('dialog', { name: /cannot delete/i });
    expect(within(dialog).getByText(/Gate cam/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /ok/i }));
    expect(deleted).toBe(0);
  });
});
