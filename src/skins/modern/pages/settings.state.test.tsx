import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';

// TanStack Router's Link/createFileRoute would hit the route tree at module-init.
// Stub them so the page can render bare in the test harness.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={to ?? '#'} {...rest}>{children}</a>
  ),
  createFileRoute: () => () => ({ component: null }),
  useRouterState: () => ({ location: { pathname: '/settings/state' } }),
}));

// The page imports AppShell which pulls in skin chrome; reduce to a passthrough
// so tests focus on the page body.
vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const { default: RunStatePage } = await import('./settings.state');

const server = setupServer();

beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: { iat: 0, exp: 4102444800, user: 'admin', uid: 1 }, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'warn' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

function seedStates() {
  return [
    { id: 1, name: 'default', definition: '1:Always:Always:Always,2:Always:Always:Always', is_active: 1 },
    { id: 2, name: 'Away',    definition: '1:None:None:None,2:None:None:None',              is_active: 0 },
    { id: 3, name: 'start',   definition: '',                                               is_active: 0 }, // reserved — should be filtered out
  ];
}
function seedMonitors() {
  return [
    { id: 1, name: 'Cam 1', capturing: 'Always', analysing: 'Always', recording: 'Always' },
    { id: 2, name: 'Cam 2', capturing: 'Always', analysing: 'None',   recording: 'OnMotion' },
  ];
}

function setupHappyPath() {
  server.use(
    http.get('/api/v3/states', () => HttpResponse.json({
      items: seedStates(), total: 3, per_page: 200, current_page: 1, last_page: 1,
    })),
    http.get('/api/v3/monitors', () => HttpResponse.json({
      items: seedMonitors(), total: 2, per_page: 1000, current_page: 1, last_page: 1,
    })),
  );
}

describe('Run State page — list', () => {
  it('renders saved states from /states', async () => {
    setupHappyPath();
    renderWithProviders(<RunStatePage />);
    await waitFor(() => expect(screen.getByText('default')).toBeInTheDocument());
    expect(screen.getByText('Away')).toBeInTheDocument();
  });

  it('filters out reserved names (start/stop/restart)', async () => {
    setupHappyPath();
    renderWithProviders(<RunStatePage />);
    await waitFor(() => expect(screen.getByText('default')).toBeInTheDocument());
    // The synthetic "start" row in the fixture must not appear as a list entry.
    expect(screen.queryByRole('button', { name: /apply state start/i })).not.toBeInTheDocument();
  });

  it('marks the active state with an Active badge', async () => {
    setupHappyPath();
    renderWithProviders(<RunStatePage />);
    await waitFor(() => expect(screen.getByText('default')).toBeInTheDocument());
    // Two matches expected: the table header "Active" + the per-row badge
    // on the is_active=1 row. The badge sits inside a span tinted with the
    // `ok` state token, distinct from the <th>.
    const badges = screen.getAllByText('Active');
    expect(badges.length).toBeGreaterThanOrEqual(2);
    expect(badges.some((el) => el.className.includes('text-ok'))).toBe(true);
  });

  it('disables Delete on the protected "default" state', async () => {
    setupHappyPath();
    renderWithProviders(<RunStatePage />);
    await waitFor(() => expect(screen.getByText('default')).toBeInTheDocument());
    const deleteBtn = screen.getByRole('button', { name: /delete state default/i });
    expect(deleteBtn).toBeDisabled();
  });
});

describe('Run State page — apply', () => {
  it('confirms then POSTs /system/state on Apply', async () => {
    setupHappyPath();
    let body: unknown = null;
    server.use(
      http.post('/api/v3/system/state', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true, message: 'applied' });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<RunStatePage />);
    await waitFor(() => expect(screen.getByText('Away')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /apply state away/i }));
    // Confirm dialog
    await waitFor(() => expect(screen.getByText(/Apply run state/i)).toBeInTheDocument());
    // The dialog's Apply button has accessible name "Apply"
    const confirmBtn = screen.getAllByRole('button', { name: /^apply$/i }).pop()!;
    await user.click(confirmBtn);

    await waitFor(() => expect(body).toEqual({ state_name: 'Away' }));
  });

  it('declining the confirm does NOT call the API', async () => {
    setupHappyPath();
    let hits = 0;
    server.use(
      http.post('/api/v3/system/state', () => {
        hits += 1;
        return HttpResponse.json({ success: true, message: 'applied' });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<RunStatePage />);
    await waitFor(() => expect(screen.getByText('Away')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /apply state away/i }));
    await waitFor(() => expect(screen.getByText(/Apply run state/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    // Give the mutation a tick to NOT fire
    await new Promise((r) => setTimeout(r, 10));
    expect(hits).toBe(0);
  });

  it('disables Apply on the currently-active state', async () => {
    setupHappyPath();
    renderWithProviders(<RunStatePage />);
    await waitFor(() => expect(screen.getByText('default')).toBeInTheDocument());
    const applyBtn = screen.getByRole('button', { name: /apply state default/i });
    expect(applyBtn).toBeDisabled();
  });
});

describe('Run State page — daemon controls', () => {
  it('Start confirms first then POSTs /server/control/start', async () => {
    setupHappyPath();
    let hits = 0;
    server.use(
      http.post('/api/v3/server/control/start', () => {
        hits += 1;
        return HttpResponse.json({ message: 'starting' });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<RunStatePage />);
    await waitFor(() => expect(screen.getByText('default')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /^start$/i }));
    await waitFor(() => expect(screen.getByText(/Start ZoneMinder\?/i)).toBeInTheDocument());
    expect(hits).toBe(0);
    const allStart = screen.getAllByRole('button', { name: /^start$/i });
    await user.click(allStart[allStart.length - 1]);
    await waitFor(() => expect(hits).toBe(1));
  });

  it('Stop confirms first then POSTs /server/control/stop', async () => {
    setupHappyPath();
    let hits = 0;
    server.use(
      http.post('/api/v3/server/control/stop', () => {
        hits += 1;
        return HttpResponse.json({ message: 'stopping' });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<RunStatePage />);
    await waitFor(() => expect(screen.getByText('default')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /^stop$/i }));
    // Confirm dialog appears
    await waitFor(() => expect(screen.getByText(/Stop ZoneMinder\?/i)).toBeInTheDocument());
    expect(hits).toBe(0);

    // Click the dialog's Stop button (second occurrence — the first is the panel button now disabled)
    const allStop = screen.getAllByRole('button', { name: /^stop$/i });
    await user.click(allStop[allStop.length - 1]);
    await waitFor(() => expect(hits).toBe(1));
  });

  it('Restart confirms first then POSTs /server/control/restart', async () => {
    setupHappyPath();
    let hits = 0;
    server.use(
      http.post('/api/v3/server/control/restart', () => {
        hits += 1;
        return HttpResponse.json({ message: 'restarting' });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<RunStatePage />);
    await waitFor(() => expect(screen.getByText('default')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /^restart$/i }));
    await waitFor(() => expect(screen.getByText(/Restart ZoneMinder\?/i)).toBeInTheDocument());

    const allRestart = screen.getAllByRole('button', { name: /^restart$/i });
    await user.click(allRestart[allRestart.length - 1]);
    await waitFor(() => expect(hits).toBe(1));
  });
});

describe('Run State page — save current', () => {
  it('POSTs /states with a composed definition from current monitors', async () => {
    setupHappyPath();
    let body: { name: string; definition: string; is_active: number } | null = null;
    server.use(
      http.post('/api/v3/states', async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ id: 99, ...body!, }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<RunStatePage />);
    await waitFor(() => expect(screen.getByText('default')).toBeInTheDocument());

    await user.type(screen.getByLabelText(/new state name/i), 'Holiday');
    await user.click(screen.getByRole('button', { name: /save snapshot/i }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body!.name).toBe('Holiday');
    expect(body!.is_active).toBe(0);
    // composeDefinition orders by id
    expect(body!.definition).toBe('1:Always:Always:Always,2:Always:None:OnMotion');
  });

  it('refuses to save a reserved name', async () => {
    setupHappyPath();
    let hits = 0;
    server.use(
      http.post('/api/v3/states', () => {
        hits += 1;
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    useToastStore.getState().clear();
    const user = userEvent.setup();
    renderWithProviders(<RunStatePage />);
    await waitFor(() => expect(screen.getByText('default')).toBeInTheDocument());

    await user.type(screen.getByLabelText(/new state name/i), 'restart');
    await user.click(screen.getByRole('button', { name: /save snapshot/i }));

    const toasts = useToastStore.getState().toasts;
    expect(toasts.some((x) => x.tone === 'error' && /reserved name/.test(x.message))).toBe(true);
    expect(hits).toBe(0);
  });
});

describe('Run State page — delete', () => {
  it('confirms then DELETEs /states/{id}', async () => {
    setupHappyPath();
    let deleted = 0;
    server.use(
      http.delete('/api/v3/states/2', () => {
        deleted += 1;
        return HttpResponse.json({}, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<RunStatePage />);
    await waitFor(() => expect(screen.getByText('Away')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /delete state away/i }));
    await waitFor(() => expect(screen.getByText(/Delete state/i)).toBeInTheDocument());
    const allDelete = screen.getAllByRole('button', { name: /^delete$/i });
    await user.click(allDelete[allDelete.length - 1]);
    await waitFor(() => expect(deleted).toBe(1));
  });
});
