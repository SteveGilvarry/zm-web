/**
 * Filters page (classic skin) — the single legacy `?view=filter` form: the
 * "Use Filter" chooser, the term rows, the Actions / Options checkbox
 * columns and the button bar (Save, Save As, Delete, Debug, Reset) plus the
 * matches preview.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';
import {
  PURGE_WHEN_FULL_QUERY_JSON, PURGE_WHEN_FULL_ROW, UPDATE_DISK_SPACE_ROW,
} from '@/features/filters/liveFixtures';
import type { UserClaims } from '@/types';

let mockSearch: Record<string, unknown> = {};
const mockNavigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => mockSearch,
  useNavigate: () => mockNavigate,
  Link: ({ children, to, params, search, ...rest }: {
    children: React.ReactNode; to?: string; params?: Record<string, string>;
    search?: Record<string, unknown>; [k: string]: unknown;
  }) => {
    const path = to && params
      ? Object.entries(params).reduce((acc, [k, v]) => acc.replace(`$${k}`, String(v)), to)
      : (to ?? '#');
    const qs = search
      ? `?${new URLSearchParams(Object.entries(search).reduce((acc, [k, v]) => {
        if (v != null) acc[k] = String(v);
        return acc;
      }, {} as Record<string, string>)).toString()}`
      : '';
    return <a href={`${path}${qs}`} {...rest}>{children}</a>;
  },
}));

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const perms = (over: Record<string, string> = {}) => ({
  iat: 0, exp: 0, uid: 1, user: 'admin',
  perms: {
    stream: 'Edit', events: 'Edit', control: 'Edit', monitors: 'Edit',
    groups: 'Edit', devices: 'Edit', snapshots: 'Edit', system: 'Edit', ...over,
  },
} as unknown as UserClaims);

function signIn(user: UserClaims = perms()) {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user, isAuthenticated: true });
}

const server = setupServer();
beforeAll(() => { server.listen({ onUnhandledRequest: 'error' }); });
beforeEach(() => { signIn(); });
afterEach(() => {
  server.resetHandlers();
  mockSearch = {};
  mockNavigate.mockReset();
  useToastStore.getState().clear();
});
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

function paged<T>(items: T[]) {
  return { items, total: items.length, per_page: 200, current_page: 1, last_page: 1 };
}

/** A filter whose `query_json` the editor cannot read (and must not overwrite). */
const UNREADABLE_ROW = {
  ...UPDATE_DISK_SPACE_ROW,
  id: 9,
  name: 'Old dashboard filter',
  query_json: JSON.stringify({ rules: [{ field: 'cause', operator: 'contains', value: 'x' }] }),
  filter: undefined,
};

/** Concurrent + background, so the chooser decorates it with `*` and `&`. */
const DECORATED_ROW = {
  ...UPDATE_DISK_SPACE_ROW,
  id: 4,
  name: 'Nightly',
  background: 1,
  concurrent: 1,
};

const MONITORS = [
  { id: 1, name: 'Front Door', width: 1920, height: 1080, orientation: 'ROTATE_0', type: 'Ffmpeg', capturing: 'Always', analysing: 'Always', recording: 'OnMotion', enabled: 1 },
];
const STORAGE = [{ id: 1, name: 'Default', path: '/var/cache/zm', type: 'local', enabled: 1 }];
const USERS = [{ id: 1, username: 'admin' }, { id: 2, username: 'operator' }];

function stub({
  filters = [PURGE_WHEN_FULL_ROW, UPDATE_DISK_SPACE_ROW, UNREADABLE_ROW, DECORATED_ROW],
  users = USERS,
}: { filters?: unknown[]; users?: unknown[] } = {}) {
  server.use(
    http.get('/api/v3/filters', () => HttpResponse.json(paged(filters))),
    http.get('/api/v3/monitors', () => HttpResponse.json(paged(MONITORS))),
    http.get('/api/v3/storage', () => HttpResponse.json(paged(STORAGE))),
    http.get('/api/v3/users', () => HttpResponse.json(paged(users))),
  );
}

async function mount() {
  const { default: Page } = await import('./filters');
  return renderWithProviders(<Page />);
}

/** Wait for the saved-filter list to land in the chooser. */
async function chooser() {
  const select = await screen.findByLabelText('Use Filter');
  // Legacy decorates the label: `*` = runs in background, `&` = concurrent.
  await waitFor(() => expect(within(select).getByRole('option', { name: 'PurgeWhenFull*' })).toBeInTheDocument());
  return select;
}

describe('ClassicFiltersPage', () => {
  it('renders the legacy form: chooser, name, run-as, actions and options', async () => {
    stub();
    await mount();

    const select = await chooser();
    // Background `*` and concurrent `&` decorate the option label, as legacy does.
    expect(within(select).getByRole('option', { name: 'Nightly*&' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Choose Filter' })).toBeInTheDocument();

    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(screen.getByLabelText('User to run filter as')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Actions' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Options' })).toBeInTheDocument();
    for (const label of [
      'Archive all matches', 'Unarchive all matches', 'Update used disk space',
      'Create video for all matches', 'Upload all matches', 'Email details of all matches',
      'Message details of all matches', 'Execute command on all matches',
      'Delete all matches', 'Copy all matches', 'Move all matches',
      'Run filter in background', 'Run filter concurrently', 'Lock Rows',
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByLabelText(/^Execute Interval/)).toHaveValue(60);

    for (const name of ['Save', 'Save As', 'Delete', 'Debug', 'Reset']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    // Nothing selected yet: Save needs a name, Delete needs a row.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('loads a chosen filter: terms into the builder, columns into the checkboxes', async () => {
    const user = userEvent.setup();
    stub();
    await mount();

    await user.selectOptions(await chooser(), '1');

    expect(screen.getByLabelText('Name')).toHaveValue('PurgeWhenFull');
    expect(screen.getAllByTestId('filter-term')).toHaveLength(3);
    expect(screen.getByLabelText('Delete all matches')).toBeChecked();
    expect(screen.getByLabelText('Run filter in background')).toBeChecked();
    expect(screen.getByLabelText('Archive all matches')).not.toBeChecked();
    expect(screen.getByLabelText('Sort by')).toHaveValue('Id');
    expect(screen.getByLabelText('Sort direction')).toHaveValue('1');
    expect(screen.getByLabelText('Limit to first')).toHaveValue(100);
    expect(screen.getByLabelText('Skip Locked')).toHaveValue('0');

    // Selection is pushed to the URL so the form is linkable.
    expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ replace: true }));
  });

  it('PUTs the name, query_json and every column on Save', async () => {
    const user = userEvent.setup();
    stub();
    let body: Record<string, unknown> | undefined;
    server.use(http.put('/api/v3/filters/1', async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(PURGE_WHEN_FULL_ROW);
    }));
    await mount();

    await user.selectOptions(await chooser(), '1');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body!.name).toBe('PurgeWhenFull');
    // An untouched filter round-trips its query byte-for-byte.
    expect(body!.query_json).toBe(PURGE_WHEN_FULL_QUERY_JSON);
    expect(body).toMatchObject({
      auto_delete: 1, background: 1, auto_archive: 0, concurrent: 0,
      execute_interval: 60, user_id: 1, email_format: 'Individual',
    });
  });

  it('puts a newly ticked action into the saved body', async () => {
    const user = userEvent.setup();
    stub();
    let body: Record<string, unknown> | undefined;
    server.use(http.put('/api/v3/filters/2', async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(UPDATE_DISK_SPACE_ROW);
    }));
    await mount();

    await user.selectOptions(await chooser(), '2');
    await user.click(screen.getByLabelText('Archive all matches'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body).toMatchObject({ auto_archive: 1, update_disk_space: 1 });
  });

  it('POSTs a brand-new filter built in the rule builder', async () => {
    const user = userEvent.setup();
    stub();
    let body: Record<string, unknown> | undefined;
    server.use(http.post('/api/v3/filters', async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ...PURGE_WHEN_FULL_ROW, id: 77, name: 'Front door only' });
    }));
    await mount();

    await chooser();
    await user.type(screen.getByLabelText('Name'), 'Front door only');
    await user.click(screen.getByRole('button', { name: 'Add condition' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body!.name).toBe('Front door only');
    const q = JSON.parse(String(body!.query_json)) as { terms: Array<Record<string, string>> };
    expect(q.terms).toEqual([
      { obr: '0', attr: 'MonitorId', op: '=', val: '1', cbr: '0' },
    ]);
    expect(body).toMatchObject({ execute_interval: 60, auto_delete: 0 });
  });

  it('Save As prompts for a name and POSTs a copy', async () => {
    const user = userEvent.setup();
    stub();
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('PurgeWhenFull spare');
    let body: Record<string, unknown> | undefined;
    server.use(http.post('/api/v3/filters', async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ...PURGE_WHEN_FULL_ROW, id: 78, name: 'PurgeWhenFull spare' });
    }));
    await mount();

    await user.selectOptions(await chooser(), '1');
    await user.click(screen.getByRole('button', { name: 'Save As' }));

    expect(prompt).toHaveBeenCalledWith('Save filter as', 'PurgeWhenFull copy');
    await waitFor(() => expect(body).toBeDefined());
    expect(body!.name).toBe('PurgeWhenFull spare');
    expect(body!.query_json).toBe(PURGE_WHEN_FULL_QUERY_JSON);
  });

  it('Save As does nothing when the prompt is dismissed', async () => {
    const user = userEvent.setup();
    stub();
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    const posts: unknown[] = [];
    server.use(http.post('/api/v3/filters', async ({ request }) => {
      posts.push(await request.json());
      return HttpResponse.json(PURGE_WHEN_FULL_ROW);
    }));
    await mount();

    await user.selectOptions(await chooser(), '1');
    await user.click(screen.getByRole('button', { name: 'Save As' }));

    await new Promise((r) => setTimeout(r, 20));
    expect(posts).toEqual([]);
  });

  it('Delete confirms by name, then DELETEs and clears the form', async () => {
    const user = userEvent.setup();
    stub();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deleted: string[] = [];
    server.use(http.delete('/api/v3/filters/:id', ({ params }) => {
      deleted.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }));
    await mount();

    await user.selectOptions(await chooser(), '1');
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(confirm).toHaveBeenCalledWith('Delete filter "PurgeWhenFull"?');
    await waitFor(() => expect(deleted).toEqual(['1']));
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue(''));
  });

  it('Delete does nothing when the confirm is dismissed', async () => {
    const user = userEvent.setup();
    stub();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const deleted: string[] = [];
    server.use(http.delete('/api/v3/filters/:id', ({ params }) => {
      deleted.push(String(params.id));
      return new HttpResponse(null, { status: 204 });
    }));
    await mount();

    await user.selectOptions(await chooser(), '1');
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await new Promise((r) => setTimeout(r, 20));
    expect(deleted).toEqual([]);
  });

  it('warns, and asks again, when a condition-less filter would delete everything', async () => {
    const user = userEvent.setup();
    stub();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const posts: unknown[] = [];
    server.use(http.post('/api/v3/filters', async ({ request }) => {
      posts.push(await request.json());
      return HttpResponse.json(PURGE_WHEN_FULL_ROW);
    }));
    await mount();

    await chooser();
    await user.type(screen.getByLabelText('Name'), 'Reaper');
    await user.click(screen.getByLabelText('Delete all matches'));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No conditions + Delete all matches = every event will be deleted when this filter runs.',
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(confirm.mock.calls[0][0]).toContain('every event will be deleted');
    await new Promise((r) => setTimeout(r, 20));
    expect(posts).toEqual([]);
  });

  it('shows an unreadable query raw and refuses to save over it', async () => {
    const user = userEvent.setup();
    stub();
    await mount();

    await user.selectOptions(await chooser(), '9');

    const box = await screen.findByTestId('unreadable-query');
    expect(box).toHaveTextContent('no "terms" array');
    expect(box).toHaveTextContent('"field":"cause"');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save As' })).toBeDisabled();
    // The rule builder is not offered at all — nothing to edit safely.
    expect(screen.queryByRole('button', { name: 'Add condition' })).toBeNull();
    // Delete still works: the row itself is fine.
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  it('round-trips Sort by / direction / Skip Locked / Limit into query_json', async () => {
    const user = userEvent.setup();
    stub();
    let body: Record<string, unknown> | undefined;
    server.use(http.put('/api/v3/filters/2', async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(UPDATE_DISK_SPACE_ROW);
    }));
    await mount();

    await user.selectOptions(await chooser(), '2');
    await user.selectOptions(screen.getByLabelText('Sort by'), 'MaxScore');
    await user.selectOptions(screen.getByLabelText('Sort direction'), '1');
    await user.selectOptions(screen.getByLabelText('Skip Locked'), '1');
    const limit = screen.getByLabelText('Limit to first');
    await user.clear(limit);
    await user.type(limit, '25');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(body).toBeDefined());
    expect(JSON.parse(String(body!.query_json))).toMatchObject({
      sort_field: 'MaxScore', sort_asc: '1', skip_locked: '1', limit: '25',
    });
  });

  it('reveals the command box, email fields and storage pickers with their actions', async () => {
    const user = userEvent.setup();
    stub();
    await mount();

    await chooser();
    expect(screen.queryByLabelText('Command')).toBeNull();

    await user.click(screen.getByLabelText('Execute command on all matches'));
    await user.type(await screen.findByLabelText('Command'), '/usr/bin/notify %EI%');

    await user.click(screen.getByLabelText('Email details of all matches'));
    await user.type(await screen.findByLabelText('Email to'), 'ops@example.net');
    expect(screen.getByLabelText('Subject')).toBeInTheDocument();
    expect(screen.getByLabelText('Body')).toBeInTheDocument();
    expect(screen.getByLabelText('Format')).toHaveValue('Individual');

    await user.click(screen.getByLabelText('Copy all matches'));
    const copyTo = await screen.findByLabelText('Copy to');
    expect(within(copyTo).getByRole('option', { name: 'Default — /var/cache/zm' })).toBeInTheDocument();

    await user.click(screen.getByLabelText('Move all matches'));
    expect(await screen.findByLabelText('Move to')).toBeInTheDocument();
  });

  it('sends the command, email and copy-target columns on save', async () => {
    const user = userEvent.setup();
    stub();
    let body: Record<string, unknown> | undefined;
    server.use(http.put('/api/v3/filters/2', async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(UPDATE_DISK_SPACE_ROW);
    }));
    await mount();

    await user.selectOptions(await chooser(), '2');
    await user.click(screen.getByLabelText('Execute command on all matches'));
    await user.type(await screen.findByLabelText('Command'), '/bin/true');
    await user.click(screen.getByLabelText('Copy all matches'));
    await user.selectOptions(await screen.findByLabelText('Copy to'), '1');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body).toMatchObject({
      auto_execute: 1, auto_execute_cmd: '/bin/true', auto_copy: 1, auto_copy_to: 1,
    });
  });

  it('sends the whole email block, the move target and the execute interval', async () => {
    const user = userEvent.setup();
    stub();
    let body: Record<string, unknown> | undefined;
    server.use(http.put('/api/v3/filters/2', async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(UPDATE_DISK_SPACE_ROW);
    }));
    await mount();

    await user.selectOptions(await chooser(), '2');

    await user.click(screen.getByLabelText('Email details of all matches'));
    await user.type(await screen.findByLabelText('Email to'), 'ops@example.net');
    await user.type(screen.getByLabelText('Subject'), 'ZM alarm');
    await user.type(screen.getByLabelText('Body'), 'Event %EI% fired');
    await user.selectOptions(screen.getByLabelText('Format'), 'Summary');

    await user.click(screen.getByLabelText('Move all matches'));
    await user.selectOptions(await screen.findByLabelText('Move to'), '1');

    const interval = screen.getByLabelText(/^Execute Interval/);
    await user.clear(interval);
    await user.type(interval, '300');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body).toMatchObject({
      auto_email: 1,
      email_to: 'ops@example.net',
      email_subject: 'ZM alarm',
      email_body: 'Event %EI% fired',
      email_format: 'Summary',
      auto_move: 1,
      auto_move_to: 1,
      execute_interval: 300,
    });
  });

  it('floors a nonsense execute interval at zero', async () => {
    const user = userEvent.setup();
    stub();
    await mount();

    await chooser();
    const interval = screen.getByLabelText(/^Execute Interval/);
    await user.clear(interval);
    expect(interval).toHaveValue(0);
  });

  it('Reset drops unsaved edits back to the stored row', async () => {
    const user = userEvent.setup();
    stub();
    await mount();

    await user.selectOptions(await chooser(), '1');
    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Scribbled over');
    await user.click(screen.getByLabelText('Archive all matches'));

    await user.click(screen.getByRole('button', { name: 'Reset' }));

    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('PurgeWhenFull'));
    expect(screen.getByLabelText('Archive all matches')).not.toBeChecked();
  });

  it('Debug shows the backend AST for a saved row and our own for a draft', async () => {
    const user = userEvent.setup();
    stub();
    await mount();

    await chooser();
    await user.click(screen.getByRole('button', { name: 'Debug' }));
    expect(await screen.findByTestId('filter-debug')).toBeInTheDocument();

    // `Update DiskSpace` carries the backend's own parse in `filter`.
    await user.selectOptions(screen.getByLabelText('Use Filter'), '2');
    await waitFor(() => expect(screen.getByTestId('filter-debug')).toHaveTextContent('"disk_space"'));

    await user.click(screen.getByRole('button', { name: 'Debug' }));
    expect(screen.queryByTestId('filter-debug')).toBeNull();
  });

  it('lists matches through the server preview', async () => {
    const user = userEvent.setup();
    stub();
    let ast: unknown;
    server.use(http.post('/api/v3/filters/preview', async ({ request }) => {
      ast = await request.json();
      return HttpResponse.json({
        items: [{
          id: 5150, monitor_id: 1, name: 'Event-5150', cause: 'Motion',
          start_date_time: '2026-08-21T06:40:00Z', end_date_time: '2026-08-21T06:41:00Z',
          length: '60.00', archived: 0,
        }],
        total: 1, per_page: 50, current_page: 1, last_page: 1,
      });
    }));
    await mount();

    // `Update DiskSpace` maps cleanly onto the backend AST.
    await user.selectOptions(await chooser(), '2');
    await user.click(screen.getByRole('button', { name: 'List matches' }));

    expect(await screen.findByText('Event-5150')).toBeInTheDocument();
    expect(screen.getByText('1 match (server preview)')).toBeInTheDocument();
    expect(ast).toMatchObject({ where: { match: 'all' } });
    expect(screen.getByRole('button', { name: 'Hide matches' })).toBeInTheDocument();
  });

  it('links View matches to Montage Review framed by the terms', async () => {
    const user = userEvent.setup();
    stub();
    await mount();

    await user.selectOptions(await chooser(), '2');
    expect(screen.getByRole('link', { name: 'View matches' })).toHaveAttribute(
      'href', expect.stringContaining('/montagereview'),
    );
  });

  it('hides Save / Save As / Delete for an events-View user', async () => {
    signIn(perms({ events: 'View' }));
    stub();
    await mount();

    await chooser();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save As' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    // Read-only inspection still works.
    expect(screen.getByRole('button', { name: 'Debug' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
  });

  it('disables the run-as select when the caller may not list users', async () => {
    signIn(perms({ system: 'None' }));
    stub({ users: [] });
    await mount();

    const runAs = await screen.findByLabelText('User to run filter as');
    expect(runAs).toBeDisabled();
    expect(runAs).toHaveAttribute('title', 'Listing users needs System view permission.');
  });

  it('picks the run-as user when the list is available', async () => {
    const user = userEvent.setup();
    stub();
    let body: Record<string, unknown> | undefined;
    server.use(http.put('/api/v3/filters/2', async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(UPDATE_DISK_SPACE_ROW);
    }));
    await mount();

    await user.selectOptions(await chooser(), '2');
    const runAs = screen.getByLabelText('User to run filter as');
    await waitFor(() => expect(within(runAs).getByRole('option', { name: 'operator' })).toBeInTheDocument());
    await user.selectOptions(runAs, '2');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body!.user_id).toBe(2);
  });

  it('renders the backend error instead of the form', async () => {
    server.use(
      http.get('/api/v3/filters', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'filters table locked' }, { status: 500 })),
      http.get('/api/v3/monitors', () => HttpResponse.json(paged([]))),
      http.get('/api/v3/storage', () => HttpResponse.json(paged([]))),
      http.get('/api/v3/users', () => HttpResponse.json(paged([]))),
    );
    await mount();

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
    expect(screen.queryByLabelText('Use Filter')).toBeNull();
  });

  it('reports a dead backend as unreachable', async () => {
    server.use(
      http.get('/api/v3/filters', () => HttpResponse.error()),
      http.get('/api/v3/monitors', () => HttpResponse.json(paged([]))),
      http.get('/api/v3/storage', () => HttpResponse.json(paged([]))),
      http.get('/api/v3/users', () => HttpResponse.json(paged([]))),
    );
    await mount();

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
  });

  it('opens the filter named by ?id=', async () => {
    mockSearch = { id: 2 };
    stub();
    await mount();

    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Update DiskSpace'));
    expect(screen.getByLabelText('Update used disk space')).toBeChecked();
  });

  it('seeds a new draft from ?terms= (the Events list hand-off)', async () => {
    mockSearch = {
      terms: JSON.stringify([{ attr: 'MonitorId', op: '=', val: '1' }]),
    };
    stub();
    await mount();

    await chooser();
    expect(screen.getAllByTestId('filter-term')).toHaveLength(1);
    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(screen.getByLabelText('Use Filter')).toHaveValue('');
  });

  it('removes a condition from the builder', async () => {
    const user = userEvent.setup();
    stub();
    await mount();

    await user.selectOptions(await chooser(), '1');
    expect(screen.getAllByTestId('filter-term')).toHaveLength(3);

    await user.click(screen.getAllByRole('button', { name: 'Remove condition' })[0]);
    expect(screen.getAllByTestId('filter-term')).toHaveLength(2);
  });
});
