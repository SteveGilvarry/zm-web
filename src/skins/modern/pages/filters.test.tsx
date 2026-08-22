/**
 * Integration-style tests for the Filters page: the editor round-trips the
 * live ZoneMinder filters, sends columns as columns, and refuses to touch a
 * query_json it cannot read.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import {
  PURGE_WHEN_FULL_QUERY_JSON, PURGE_WHEN_FULL_ROW, UPDATE_DISK_SPACE_ROW,
} from '@/features/filters/liveFixtures';

let mockSearch: Record<string, unknown> = {};
const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => mockSearch,
  useNavigate: () => mockNavigate,
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={to ?? '#'} {...rest}>{children}</a>
  ),
}));

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: { user: 'admin', iat: 0, exp: 0 } as never, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => { server.resetHandlers(); mockSearch = {}; mockNavigate.mockReset(); });
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

async function mount() {
  const { default: Page } = await import('./filters');
  return renderWithProviders(<Page />);
}

const unreadable = {
  ...UPDATE_DISK_SPACE_ROW,
  id: 9,
  name: 'Mystery',
  query_json: '{"rules":[{"field":"cause","operator":"contains","value":"x"}]}',
  filter: undefined,
};

function stub(items: unknown[] = [PURGE_WHEN_FULL_ROW, UPDATE_DISK_SPACE_ROW, unreadable]) {
  server.use(
    http.get('/api/v3/filters', () =>
      HttpResponse.json({ items, total: items.length, per_page: 200, current_page: 1, last_page: 1 })),
    http.get('/api/v3/monitors', () =>
      HttpResponse.json({
        items: [{ id: 1, name: 'Front Door' }, { id: 2, name: 'Driveway' }],
        total: 2, per_page: 200, current_page: 1, last_page: 1,
      })),
    http.get('/api/v3/users', () =>
      HttpResponse.json({ items: [{ id: 1, username: 'admin' }], total: 1, per_page: 100, current_page: 1, last_page: 1 })),
    http.get('/api/v3/storage', () =>
      HttpResponse.json({
        items: [{ id: 1, name: 'Default', path: '/var/cache/zoneminder/events', type: 'local', enabled: 1 }],
        total: 1, per_page: 200, current_page: 1, last_page: 1,
      })),
  );
}

describe('FiltersPage — saved list', () => {
  it('lists filters with the legacy background (*) cue', async () => {
    stub();
    await mount();
    const purge = await screen.findByRole('button', { name: /^PurgeWhenFull/ });
    expect(purge).toHaveTextContent('PurgeWhenFull*');
  });
});

describe('FiltersPage — editing a live ZoneMinder filter', () => {
  it('shows the three PurgeWhenFull terms, sort/limit and action flags, and PUTs them back unchanged', async () => {
    stub();
    let body: Record<string, unknown> = {};
    server.use(
      http.put('/api/v3/filters/1', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(PURGE_WHEN_FULL_ROW);
      }),
    );
    const user = userEvent.setup();
    await mount();
    await user.click(await screen.findByRole('button', { name: /^PurgeWhenFull/ }));

    const rows = screen.getAllByTestId('filter-term');
    expect(rows).toHaveLength(3);
    expect((within(rows[1]).getByLabelText('Attribute') as HTMLSelectElement).value).toBe('DiskPercent');
    expect((within(rows[1]).getByLabelText('Operator') as HTMLSelectElement).value).toBe('>=');
    expect((within(rows[1]).getByLabelText('Value') as HTMLInputElement).value).toBe('80');
    expect((screen.getByLabelText(/sort by/i) as HTMLSelectElement).value).toBe('Id');
    expect((screen.getByLabelText(/sort direction/i) as HTMLSelectElement).value).toBe('1');
    expect((screen.getByLabelText(/limit to first/i) as HTMLInputElement).value).toBe('100');
    expect(screen.getByRole('switch', { name: /delete all matches/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: /run in background/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: /^archive all matches/i })).toHaveAttribute('aria-checked', 'false');
    expect((screen.getByLabelText(/execute interval/i) as HTMLInputElement).value).toBe('60');

    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(body.query_json).toBe(PURGE_WHEN_FULL_QUERY_JSON));
    expect(body).toMatchObject({ auto_delete: 1, background: 1, execute_interval: 60 });
    expect(body).not.toHaveProperty('query');
  });

  it('edits a value and a new action and sends both in the right place', async () => {
    stub();
    let body: Record<string, unknown> = {};
    server.use(
      http.put('/api/v3/filters/2', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(UPDATE_DISK_SPACE_ROW);
      }),
    );
    const user = userEvent.setup();
    await mount();
    await user.click(await screen.findByRole('button', { name: /^Update DiskSpace/ }));

    await user.click(screen.getByRole('switch', { name: /unarchive all matches/i }));
    await user.click(screen.getByRole('switch', { name: /copy all matches/i }));
    await user.selectOptions(screen.getByLabelText(/copy to/i), '1');
    const interval = screen.getByLabelText(/execute interval/i);
    await user.clear(interval);
    await user.type(interval, '900');
    await user.selectOptions(screen.getByLabelText(/skip locked/i), '1');

    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(body.auto_unarchive).toBe(1));
    expect(body).toMatchObject({ auto_copy: 1, auto_copy_to: 1, execute_interval: 900, update_disk_space: 1 });
    expect(body.query_json).toBe(
      '{"terms":[{"attr":"DiskSpace","op":"IS","val":"NULL"},{"cnj":"and","obr":"0","attr":"EndDateTime","op":"IS NOT","val":"NULL","cbr":"0"}],"skip_locked":"1"}',
    );
  });
});

describe('FiltersPage — safety', () => {
  it('shows an unreadable query_json read-only and disables Save', async () => {
    stub();
    const user = userEvent.setup();
    await mount();
    await user.click(await screen.findByRole('button', { name: /^Mystery/ }));

    const box = screen.getByTestId('unreadable-query');
    expect(box).toHaveTextContent(/cannot read/i);
    expect(box).toHaveTextContent(unreadable.query_json);
    expect(screen.queryByTestId('filter-term')).toBeNull();
    expect(screen.queryByRole('button', { name: /add condition/i })).toBeNull();
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
  });

  it('warns when Delete all matches is on with no conditions and asks before saving', async () => {
    stub();
    let posted = false;
    server.use(http.post('/api/v3/filters', () => { posted = true; return HttpResponse.json({ ...PURGE_WHEN_FULL_ROW, id: 5 }, { status: 201 }); }));
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await mount();
    await screen.findByRole('button', { name: /^PurgeWhenFull/ });

    await user.type(screen.getByPlaceholderText(/untitled filter/i), 'Nuke');
    await user.click(screen.getByRole('switch', { name: /delete all matches/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/every event will be deleted/i);

    await user.click(screen.getByRole('button', { name: /^create$/i }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(posted).toBe(false);
    confirmSpy.mockRestore();
  });
});

describe('FiltersPage — create', () => {
  it('POSTs terms in ZM shape plus columns', async () => {
    stub();
    let body: Record<string, unknown> = {};
    server.use(
      http.post('/api/v3/filters', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...PURGE_WHEN_FULL_ROW, id: 5, name: body.name }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    await mount();
    await screen.findByRole('button', { name: /^PurgeWhenFull/ });

    await user.type(screen.getByPlaceholderText(/untitled filter/i), 'Motion on Driveway');
    await user.click(screen.getByRole('button', { name: /add condition/i }));
    await user.selectOptions(screen.getByLabelText('Value'), '2');
    await user.click(screen.getByRole('button', { name: /add condition/i }));
    const rows = screen.getAllByTestId('filter-term');
    await user.selectOptions(within(rows[1]).getByLabelText('Attribute'), 'Cause');
    await user.selectOptions(within(rows[1]).getByLabelText('Operator'), 'LIKE');
    await user.type(within(rows[1]).getByLabelText('Value'), 'Motion');
    await user.click(screen.getByRole('switch', { name: /^archive all matches/i }));
    await user.click(screen.getByRole('switch', { name: /run in background/i }));

    await user.click(screen.getByRole('button', { name: /^create$/i }));
    await waitFor(() => expect(body.name).toBe('Motion on Driveway'));
    expect(JSON.parse(body.query_json as string)).toEqual({
      terms: [
        { obr: '0', attr: 'MonitorId', op: '=', val: '2', cbr: '0' },
        { cnj: 'and', obr: '0', attr: 'Cause', op: 'LIKE', val: 'Motion', cbr: '0' },
      ],
      sort_field: 'StartDateTime', sort_asc: '0', limit: '0', skip_locked: '0',
    });
    expect(body).toMatchObject({ auto_archive: 1, background: 1, auto_delete: 0, execute_interval: 60 });
  });
});
