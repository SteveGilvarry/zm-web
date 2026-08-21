/**
 * Filters, driven through the real router.
 *
 * `filters.test.tsx` mounts the page component with a stubbed router, which
 * is the right shape for the query_json round-trip it checks. This file
 * covers what that cannot reach: the `?id=` / `?terms=` deep links, the
 * error and permission states, and the confirm/prompt-guarded actions.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { renderRoute } from '@/test/renderRoute';
import { setupMockServer, server, db } from '@/test/msw/server';
import { makeFilter, paginated } from '@/test/fixtures';

setupMockServer();

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Wait for the page (not just the shell) to be on screen. */
async function filtersPage() {
  await screen.findAllByRole('heading', { name: /^Filters$/ });
}

describe('Filters — deep links', () => {
  it('lists the saved filters', async () => {
    db.filters = [
      makeFilter({ id: 1, name: 'Recent motion' }),
      makeFilter({ id: 2, name: 'Purge when full', background: 1 }),
    ];
    renderRoute('/filters');
    await filtersPage();
    expect(await screen.findByRole('button', { name: 'Recent motion' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Purge when full*' })).toBeInTheDocument();
  });

  it('opens the filter named in ?id= with its name and terms loaded', async () => {
    db.filters = [
      makeFilter({ id: 1, name: 'Recent motion' }),
      makeFilter({ id: 7, name: 'Overnight', query_json: JSON.stringify({ terms: [], limit: '25' }) }),
    ];
    renderRoute('/filters?id=7');
    await filtersPage();
    await waitFor(() =>
      expect(screen.getByLabelText(/^Name$/i)).toHaveValue('Overnight'),
    );
    expect(screen.getByLabelText(/Limit to first/i)).toHaveValue(25);
  });

  it('BUG: ?terms= does not seed a new filter — the router hands back an array', async () => {
    // `useFiltersPage` expects `search.terms` to be the JSON *string* the
    // Events list puts in the link (`{ terms: JSON.stringify(terms) }`), but
    // TanStack Router's default search parser JSON-parses any value that
    // looks like JSON. By the time `validateSearch` sees it, `terms` is an
    // array, its `typeof === 'string'` check drops it, and the editor opens
    // empty. The Events list's "Filter" button therefore seeds nothing.
    // This asserts today's behaviour so the fix flips it, not the reverse.
    const terms = JSON.stringify([{ attr: 'MonitorId', op: '=', val: '2' }]);
    const { router } = renderRoute(`/filters?terms=${encodeURIComponent(terms)}`);
    await filtersPage();
    expect(router.state.location.search).toEqual({});
    expect(await screen.findByText(/No conditions yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /Attribute/i })).not.toBeInTheDocument();
  });

  it('shows an empty state when nothing is saved', async () => {
    db.filters = [];
    renderRoute('/filters');
    await filtersPage();
    expect(await screen.findByText(/No saved filters yet/i)).toBeInTheDocument();
  });

  it('shows the error state when the list request fails', async () => {
    server.use(
      http.get('/api/v3/filters', () => new HttpResponse(null, { status: 500 })),
    );
    renderRoute('/filters');
    await filtersPage();
    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});

describe('Filters — permissions', () => {
  it('hides delete and save for an operator with only View on events', async () => {
    db.filters = [makeFilter({ id: 1, name: 'Recent motion' })];
    renderRoute('/filters', { perms: { events: 'View' } });
    await filtersPage();
    await screen.findByRole('button', { name: 'Recent motion' });
    expect(screen.queryByRole('button', { name: /^Delete Recent motion$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Save$/ })).not.toBeInTheDocument();
  });

  it('offers them to an operator with Edit', async () => {
    db.filters = [makeFilter({ id: 1, name: 'Recent motion' })];
    renderRoute('/filters');
    await filtersPage();
    expect(
      await screen.findByRole('button', { name: /^Delete Recent motion$/ }),
    ).toBeInTheDocument();
  });
});

describe('Filters — guarded actions', () => {
  it('asks before deleting, then DELETEs the row', async () => {
    db.filters = [makeFilter({ id: 4, name: 'Overnight' })];
    let deleted: string | null = null;
    server.use(
      http.delete('/api/v3/filters/:id', ({ params }) => {
        deleted = String(params.id);
        return HttpResponse.json({ message: 'deleted' });
      }),
    );
    vi.stubGlobal('confirm', vi.fn(() => true));

    const user = userEvent.setup();
    renderRoute('/filters');
    await filtersPage();
    await user.click(await screen.findByRole('button', { name: /^Delete Overnight$/ }));

    await waitFor(() => expect(deleted).toBe('4'));
    expect(confirm).toHaveBeenCalledWith('Delete filter "Overnight"?');
  });

  it('keeps the filter when the confirm is dismissed', async () => {
    db.filters = [makeFilter({ id: 4, name: 'Overnight' })];
    const deletes: string[] = [];
    server.use(
      http.delete('/api/v3/filters/:id', ({ params }) => {
        deletes.push(String(params.id));
        return HttpResponse.json({ message: 'deleted' });
      }),
    );
    vi.stubGlobal('confirm', vi.fn(() => false));

    const user = userEvent.setup();
    renderRoute('/filters');
    await filtersPage();
    await user.click(await screen.findByRole('button', { name: /^Delete Overnight$/ }));

    expect(deletes).toEqual([]);
  });

  it('prompts for a name on Save as and POSTs a new filter under it', async () => {
    db.filters = [makeFilter({ id: 1, name: 'Recent motion' })];
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.post('/api/v3/filters', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeFilter({ id: 9, name: 'Recent motion copy' }), { status: 201 });
      }),
    );
    vi.stubGlobal('prompt', vi.fn(() => 'Recent motion copy'));

    const user = userEvent.setup();
    renderRoute('/filters?id=1');
    await filtersPage();
    await waitFor(() => expect(screen.getByLabelText(/^Name$/i)).toHaveValue('Recent motion'));

    await user.click(screen.getByRole('button', { name: /save as/i }));

    await waitFor(() => expect(posted).not.toBeNull());
    expect(posted).toMatchObject({ name: 'Recent motion copy' });
  });

  it('does not POST when the Save as prompt is cancelled', async () => {
    db.filters = [makeFilter({ id: 1, name: 'Recent motion' })];
    const posts: unknown[] = [];
    server.use(
      http.post('/api/v3/filters', async ({ request }) => {
        posts.push(await request.json());
        return HttpResponse.json(makeFilter({ id: 9 }), { status: 201 });
      }),
    );
    vi.stubGlobal('prompt', vi.fn(() => null));

    const user = userEvent.setup();
    renderRoute('/filters?id=1');
    await filtersPage();
    await waitFor(() => expect(screen.getByLabelText(/^Name$/i)).toHaveValue('Recent motion'));
    await user.click(screen.getByRole('button', { name: /save as/i }));

    expect(posts).toEqual([]);
  });

  it('warns, then double-checks, before saving a filter that deletes everything', async () => {
    db.filters = [makeFilter({ id: 1, name: 'Recent motion', query_json: JSON.stringify({ terms: [] }) })];
    const puts: unknown[] = [];
    server.use(
      http.put('/api/v3/filters/:id', async ({ request }) => {
        puts.push(await request.json());
        return HttpResponse.json(makeFilter({ id: 1 }));
      }),
    );
    vi.stubGlobal('confirm', vi.fn(() => false));

    const user = userEvent.setup();
    renderRoute('/filters?id=1');
    await filtersPage();
    await waitFor(() => expect(screen.getByLabelText(/^Name$/i)).toHaveValue('Recent motion'));

    await user.click(screen.getByRole('switch', { name: /delete all matches/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/every event will be deleted/i);

    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(confirm).toHaveBeenCalled();
    expect(puts).toEqual([]);
  });
});

describe('Filters — editor detail', () => {
  it('reveals the email fields when the email action is switched on and saves them as columns', async () => {
    db.filters = [makeFilter({ id: 1, name: 'Recent motion' })];
    let put: Record<string, unknown> | null = null;
    server.use(
      http.put('/api/v3/filters/:id', async ({ request }) => {
        put = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeFilter({ id: 1 }));
      }),
    );

    const user = userEvent.setup();
    renderRoute('/filters?id=1');
    await filtersPage();
    await waitFor(() => expect(screen.getByLabelText(/^Name$/i)).toHaveValue('Recent motion'));

    await user.click(screen.getByRole('switch', { name: /email details of all matches/i }));
    await user.type(screen.getByLabelText(/^Email to$/i), 'ops@example.com');
    await user.selectOptions(screen.getByLabelText(/^Format$/i), 'Summary');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => expect(put).not.toBeNull());
    expect(put).toMatchObject({
      auto_email: 1,
      email_to: 'ops@example.com',
      email_format: 'Summary',
    });
  });

  it('sends the sort, limit and skip-locked settings inside query_json', async () => {
    db.filters = [makeFilter({ id: 1, name: 'Recent motion' })];
    let put: { query_json?: string } | null = null;
    server.use(
      http.put('/api/v3/filters/:id', async ({ request }) => {
        put = (await request.json()) as { query_json?: string };
        return HttpResponse.json(makeFilter({ id: 1 }));
      }),
    );

    const user = userEvent.setup();
    renderRoute('/filters?id=1');
    await filtersPage();
    await waitFor(() => expect(screen.getByLabelText(/^Name$/i)).toHaveValue('Recent motion'));

    await user.selectOptions(screen.getByLabelText(/^Sort by$/i), 'MaxScore');
    await user.selectOptions(screen.getByLabelText(/^Sort direction$/i), '1');
    await user.selectOptions(screen.getByLabelText(/^Skip locked$/i), '1');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => expect(put).not.toBeNull());
    const query = JSON.parse(put!.query_json!) as Record<string, unknown>;
    expect(query).toMatchObject({ sort_field: 'MaxScore', sort_asc: '1', skip_locked: '1' });
  });

  it('shows the derived query AST behind the Debug toggle', async () => {
    db.filters = [makeFilter({ id: 1, name: 'Recent motion' })];
    const user = userEvent.setup();
    renderRoute('/filters?id=1');
    await filtersPage();
    await waitFor(() => expect(screen.getByLabelText(/^Name$/i)).toHaveValue('Recent motion'));

    expect(screen.queryByTestId('filter-debug')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /debug/i }));
    expect(await screen.findByTestId('filter-debug')).toBeInTheDocument();
  });

  it('BUG: New filter re-opens the current filter instead of clearing the form', async () => {
    // `select(null)` clears the draft and then navigates to drop `?id=`.
    // The clear happens first, so the render in between still sees
    // `search.id === 1` while `appliedId` is already null — the render-time
    // sync in `useFiltersPage` treats that as "open filter 1" and refills the
    // form. `selectedId` stays null, so Save would create a duplicate rather
    // than update. Asserting today's behaviour so the fix flips this test.
    db.filters = [makeFilter({ id: 1, name: 'Recent motion' })];
    const user = userEvent.setup();
    const { router } = renderRoute('/filters?id=1');
    await filtersPage();
    await waitFor(() => expect(screen.getByLabelText(/^Name$/i)).toHaveValue('Recent motion'));

    await user.click(screen.getByRole('button', { name: /new filter/i }));

    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(screen.getByLabelText(/^Name$/i)).toHaveValue('Recent motion');
  });

  it('starts a new filter cleanly when none is open', async () => {
    db.filters = [makeFilter({ id: 1, name: 'Recent motion' })];
    const user = userEvent.setup();
    renderRoute('/filters');
    await filtersPage();
    await screen.findByRole('button', { name: 'Recent motion' });

    await user.click(screen.getByRole('button', { name: /new filter/i }));
    expect(screen.getByLabelText(/^Name$/i)).toHaveValue('');
  });
});

  it('maps every action and option toggle onto its own backend column', async () => {
    // Each ZoneMinder action is a column, not a flag inside query_json —
    // this walks the whole board and pins the shape of one save.
    db.filters = [makeFilter({ id: 1, name: 'Recent motion' })];
    let put: Record<string, unknown> | null = null;
    server.use(
      http.put('/api/v3/filters/:id', async ({ request }) => {
        put = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeFilter({ id: 1 }));
      }),
    );

    const user = userEvent.setup();
    renderRoute('/filters?id=1');
    await filtersPage();
    await waitFor(() => expect(screen.getByLabelText(/^Name$/i)).toHaveValue('Recent motion'));

    for (const action of [
      'Archive all matches',
      'Unarchive all matches',
      'Update used disk space',
      'Create video for all matches',
      'Upload all matches',
      'Message details of all matches',
      'Execute command on all matches',
      'Delete all matches',
      'Copy all matches',
      'Move all matches',
      'Run in background',
      'Run concurrently',
      'Lock rows',
    ]) {
      await user.click(screen.getByRole('switch', { name: action }));
    }

    await user.type(screen.getByLabelText(/^Command$/i), '/usr/bin/notify.sh');
    await user.selectOptions(screen.getByLabelText(/^Copy to$/i), '1');
    await user.selectOptions(screen.getByLabelText(/^Move to$/i), '1');
    const interval = screen.getByLabelText(/Execute interval/i);
    await user.clear(interval);
    await user.type(interval, '300');
    const limit = screen.getByLabelText(/Limit to first/i);
    await user.clear(limit);
    await user.type(limit, '50');

    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => expect(put).not.toBeNull());
    expect(put).toMatchObject({
      auto_archive: 1,
      auto_unarchive: 1,
      update_disk_space: 1,
      auto_video: 1,
      auto_upload: 1,
      auto_message: 1,
      auto_execute: 1,
      auto_execute_cmd: '/usr/bin/notify.sh',
      auto_delete: 1,
      auto_copy: 1,
      auto_copy_to: 1,
      auto_move: 1,
      auto_move_to: 1,
      background: 1,
      concurrent: 1,
      lock_rows: 1,
      execute_interval: 300,
    });
    const saved = put as unknown as { query_json: string };
    expect(JSON.parse(saved.query_json)).toMatchObject({ limit: '50' });
  });

  it('collects the whole email block when the email action is on', async () => {
    db.filters = [makeFilter({ id: 1, name: 'Recent motion' })];
    let put: Record<string, unknown> | null = null;
    server.use(
      http.put('/api/v3/filters/:id', async ({ request }) => {
        put = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeFilter({ id: 1 }));
      }),
    );

    const user = userEvent.setup();
    renderRoute('/filters?id=1');
    await filtersPage();
    await waitFor(() => expect(screen.getByLabelText(/^Name$/i)).toHaveValue('Recent motion'));

    await user.click(screen.getByRole('switch', { name: 'Email details of all matches' }));
    await user.type(screen.getByLabelText(/^Email to$/i), 'ops@example.com');
    await user.type(screen.getByLabelText(/^Subject$/i), 'Alert');
    await user.type(screen.getByLabelText(/^Body$/i), 'Event %EI%');
    await user.type(screen.getByLabelText(/^Email server$/i), 'smtp.example.com');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() => expect(put).not.toBeNull());
    expect(put).toMatchObject({
      auto_email: 1,
      email_to: 'ops@example.com',
      email_subject: 'Alert',
      email_body: 'Event %EI%',
      email_server: 'smtp.example.com',
    });
  });

describe('Filters — pagination envelope', () => {
  it('reads the list out of the {items,total,…} envelope', async () => {
    server.use(
      http.get('/api/v3/filters', () =>
        HttpResponse.json(
          paginated([makeFilter({ id: 3, name: 'Nightly purge' })], { per_page: 200, total: 1 }),
        ),
      ),
    );
    renderRoute('/filters');
    await filtersPage();
    expect(await screen.findByRole('button', { name: 'Nightly purge' })).toBeInTheDocument();
  });
});
