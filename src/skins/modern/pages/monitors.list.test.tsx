/**
 * Monitors list (`/monitors`) in the modern skin, through the real router.
 *
 * The page splits in two: `MonitorsListLayout` owns the chrome (search,
 * status filter, add / refresh / view toggle, count line, empty + error
 * states, pagination, the Add dialog) and `monitors.list.tsx` renders the
 * cards or rows inside it. Both are exercised here from the URL down.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { renderRoute } from '@/test/renderRoute';
import { db, server, setupMockServer } from '@/test/msw/server';
import { makeMonitor, paginated } from '@/test/fixtures';
import type { Monitor } from '@/types';

setupMockServer();

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

async function renderList(path = '/monitors', options?: Parameters<typeof renderRoute>[1]) {
  const rendered = renderRoute(path, options);
  expect((await screen.findAllByRole('heading', { name: /^Monitors$/ })).length)
    .toBeGreaterThan(0);
  return rendered;
}

/** The card / row for a monitor, found by the watch-page link it wraps. */
async function tile(id: number): Promise<HTMLElement> {
  return await waitFor(() => {
    const link = document.querySelector(`a[href="/monitors/${id}"]`);
    if (!link) throw new Error(`no tile for monitor ${id}`);
    return link as HTMLElement;
  });
}

describe('Monitors list — renders with data', () => {
  it('shows a card per monitor with its capture mode and runtime', async () => {
    await renderList();

    const frontDoor = await tile(1);
    expect(within(frontDoor).getByText('Front Door')).toBeInTheDocument();
    expect(within(frontDoor).getByText('#1')).toBeInTheDocument();
    // capturing: 'Always' + a Connected status row at 15 fps.
    expect(within(frontDoor).getByText('Always')).toBeInTheDocument();
    expect(within(frontDoor).getByText('Connected · 15.0 fps')).toBeInTheDocument();

    const driveway = await tile(2);
    expect(within(driveway).getByText('Driveway')).toBeInTheDocument();
    expect(within(driveway).getByText('NotRunning · 0.0 fps')).toBeInTheDocument();
  });

  it('counts what is shown against what was loaded', async () => {
    await renderList();
    expect(await screen.findByText('Showing 2 of 2 monitors')).toBeInTheDocument();
  });

  it('renders rows with resolution and source in list view', async () => {
    const user = userEvent.setup();
    await renderList();
    await tile(1);

    await user.click(screen.getByRole('button', { name: 'List view' }));
    expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Grid view' })).toHaveAttribute('aria-pressed', 'false');

    const row = await tile(1);
    expect(within(row).getByText('1920x1080')).toBeInTheDocument();
    expect(within(row).getByText('Ffmpeg')).toBeInTheDocument();
  });

  it('labels a non-capturing monitor Inactive', async () => {
    db.monitors = [makeMonitor({ id: 7, name: 'Shed', capturing: 'None' })];
    const user = userEvent.setup();
    await renderList();
    await user.click(screen.getByRole('button', { name: 'List view' }));

    const row = await tile(7);
    expect(within(row).getByText('Inactive')).toBeInTheDocument();
    expect(within(row).getByText('None')).toBeInTheDocument();
  });

  it('labels On Demand capture and passes an unknown mode through', async () => {
    db.monitors = [
      makeMonitor({ id: 3, name: 'Gate', capturing: 'Ondemand' }),
      // A capture mode this build has never heard of — the label falls back
      // to the raw wire value rather than blanking the badge.
      makeMonitor({ id: 4, name: 'Odd', capturing: 'Sometimes' as Monitor['capturing'] }),
    ];
    await renderList();

    expect(within(await tile(3)).getByText('On Demand')).toBeInTheDocument();
    expect(within(await tile(4)).getByText('Sometimes')).toBeInTheDocument();
  });

  it('falls back to the resolution when a capturing monitor has no runtime row', async () => {
    // No /monitor-status row for id 5: the card cannot show fps, so it shows
    // the configured resolution instead, and the row says just "Active".
    db.monitors = [makeMonitor({ id: 5, name: 'Attic' })];
    db.monitorStatuses = [];
    const user = userEvent.setup();
    await renderList();

    expect(within(await tile(5)).getByText('1920x1080')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'List view' }));
    expect(within(await tile(5)).getByText('Active')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Grid view' }));
    expect(screen.getByRole('button', { name: 'Grid view' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(await tile(5)).getByText('1920x1080')).toBeInTheDocument();
  });

  it('flags monitors with an open live session', async () => {
    server.use(http.get('/api/v3/live/sessions', () => HttpResponse.json([2])));
    const user = userEvent.setup();
    await renderList();
    await user.click(screen.getByRole('button', { name: 'List view' }));

    const row = await tile(2);
    await waitFor(() => expect(within(row).getByText('Streaming')).toBeInTheDocument());
    expect(within(await tile(1)).queryByText('Streaming')).not.toBeInTheDocument();
  });
});

describe('Monitors list — filters', () => {
  it('filters by name as the operator types', async () => {
    const user = userEvent.setup();
    await renderList();
    await tile(1);

    await user.type(screen.getByRole('searchbox', { name: 'Search monitors' }), 'drive');

    await waitFor(() => expect(screen.getByText('Showing 1 of 2 monitors')).toBeInTheDocument());
    expect(document.querySelector('a[href="/monitors/2"]')).not.toBeNull();
    expect(document.querySelector('a[href="/monitors/1"]')).toBeNull();
  });

  it('filters by status and says so when nothing survives', async () => {
    const user = userEvent.setup();
    await renderList();
    await tile(1);

    const group = screen.getByRole('group', { name: 'Status filter' });
    await user.click(within(group).getByRole('button', { name: 'Inactive' }));

    expect(within(group).getByRole('button', { name: 'Inactive' }))
      .toHaveAttribute('aria-pressed', 'true');
    // Both seeded monitors capture Always, so "inactive" empties the list.
    expect(await screen.findByText('Try adjusting your filters')).toBeInTheDocument();

    await user.click(within(group).getByRole('button', { name: 'Streaming' }));
    expect(await screen.findByText('Try adjusting your filters')).toBeInTheDocument();

    await user.click(within(group).getByRole('button', { name: 'All' }));
    expect(await tile(1)).toBeInTheDocument();
  });

  it('keeps search, status and view mode out of the URL', async () => {
    // Only `?new=` round-trips today; the rest is component state, so a
    // filtered list cannot be shared as a link. Asserted so the day that
    // changes, this test changes with it.
    const user = userEvent.setup();
    const { router } = await renderList();
    await tile(1);

    await user.type(screen.getByRole('searchbox', { name: 'Search monitors' }), 'drive');
    await user.click(screen.getByRole('button', { name: 'List view' }));

    expect(router.state.location.pathname).toBe('/monitors');
    expect(router.state.location.search).toEqual({});
  });
});

describe('Monitors list — empty and error states', () => {
  it('says so when the fleet is empty', async () => {
    db.monitors = [];
    await renderList();

    expect(await screen.findByText('No monitors found')).toBeInTheDocument();
    // Loose match on purpose: the count line currently reads
    // "Showing 0 of 0 monitors0" because `{total && …}` renders the literal
    // 0 when the fleet is empty. Reported, not patched here.
    expect(screen.getByText(/Showing 0 of 0 monitors/)).toBeInTheDocument();
  });

  it('surfaces a 500 with a retry that refetches', async () => {
    let calls = 0;
    server.use(
      http.get('/api/v3/monitors', () => {
        calls += 1;
        return HttpResponse.json({ error_message: 'boom', code: 500 }, { status: 500 });
      }),
    );
    const user = userEvent.setup();
    await renderList();

    expect(await screen.findByText('Cannot reach the server.')).toBeInTheDocument();
    const before = calls;
    await user.click(screen.getByRole('button', { name: /Retry/ }));
    await waitFor(() => expect(calls).toBeGreaterThan(before));
  });

  it('refetches from the toolbar refresh button', async () => {
    let calls = 0;
    server.use(
      http.get('/api/v3/monitors', () => {
        calls += 1;
        return HttpResponse.json(paginated(db.monitors, { total: db.monitors.length, per_page: 24 }));
      }),
    );
    const user = userEvent.setup();
    await renderList();
    await tile(1);

    const before = calls;
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(calls).toBeGreaterThan(before));
  });
});

describe('Monitors list — permissions', () => {
  it('hides Add monitor from a view-only grant', async () => {
    await renderList('/monitors', { perms: { monitors: 'View' } });
    await tile(1);

    expect(screen.queryByRole('button', { name: 'Add monitor' })).not.toBeInTheDocument();
    // The rest of the toolbar stays usable.
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('offers Add monitor to an editor', async () => {
    await renderList();
    await tile(1);
    expect(screen.getByRole('button', { name: 'Add monitor' })).toBeInTheDocument();
  });

  it('still renders the clone and delete actions for a view-only grant', async () => {
    // Known gap: only the Add button is behind <RequirePerm>. The per-card
    // clone / delete buttons are not gated, so a View-level operator can
    // still fire the mutation and get a 403 from the backend.
    await renderList('/monitors', { perms: { monitors: 'View' } });
    const card = await tile(1);

    expect(within(card).getByRole('button', { name: 'Clone Front Door' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Delete Front Door' })).toBeInTheDocument();
  });
});

describe('Monitors list — mutations', () => {
  it('clones a monitor by POSTing a full copy with a new name', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post('/api/v3/monitors', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        const created = makeMonitor({ ...(body as Partial<Monitor>), id: 3 });
        db.monitors.push(created);
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    await renderList();
    const card = await tile(1);

    await user.click(within(card).getByRole('button', { name: 'Clone Front Door' }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body!.name).toBe('Front Door (clone)');
    expect(body!.deleted).toBe(false);
    expect(body!.sequence).toBeNull();
    // Copied from the source rather than reset to the factory defaults.
    expect(body!.path).toBe('rtsp://camera.local:554/stream1');
    expect(body!.storage_id).toBe(1);
    // Response enums come back in DB casing; the create payload uses request casing.
    expect(body!.orientation).toBe('Rotate0');

    expect(await screen.findByText('Cloned as "Front Door (clone)"')).toBeInTheDocument();
  });

  it('confirms before deleting, then DELETEs the monitor', async () => {
    const deleted: string[] = [];
    server.use(
      http.delete('/api/v3/monitors/:id', ({ params }) => {
        deleted.push(String(params.id));
        db.monitors = db.monitors.filter((m) => m.id !== Number(params.id));
        return HttpResponse.json({ message: 'deleted' });
      }),
    );
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    await renderList();
    const card = await tile(2);

    await user.click(within(card).getByRole('button', { name: 'Delete Driveway' }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toContain('Driveway');
    await waitFor(() => expect(deleted).toEqual(['2']));
    expect(await screen.findByText('Monitor deleted')).toBeInTheDocument();
  });

  it('sends nothing when the delete confirmation is dismissed', async () => {
    const deleted: string[] = [];
    server.use(
      http.delete('/api/v3/monitors/:id', ({ params }) => {
        deleted.push(String(params.id));
        return HttpResponse.json({ message: 'deleted' });
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    await renderList();
    const card = await tile(2);

    await user.click(within(card).getByRole('button', { name: 'Delete Driveway' }));

    expect(deleted).toEqual([]);
    expect(await tile(2)).toBeInTheDocument();
  });

  it('clones from a list row too, and disables both actions while busy', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post('/api/v3/monitors', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(makeMonitor({ ...(body as Partial<Monitor>), id: 3 }), { status: 201 });
      }),
    );
    const user = userEvent.setup();
    await renderList();
    await tile(1);
    await user.click(screen.getByRole('button', { name: 'List view' }));

    const row = await tile(2);
    await user.click(within(row).getByRole('button', { name: 'Clone Driveway' }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body!.name).toBe('Driveway (clone)');
    // Driveway is the rotated 2160×3840 camera; the clone keeps its geometry.
    expect(body!.width).toBe(2160);
    expect(body!.height).toBe(3840);
    expect(body!.orientation).toBe('Rotate90');
    expect(await screen.findByText('Cloned as "Driveway (clone)"')).toBeInTheDocument();
  });

  it('deletes from a list row', async () => {
    const deleted: string[] = [];
    server.use(
      http.delete('/api/v3/monitors/:id', ({ params }) => {
        deleted.push(String(params.id));
        db.monitors = db.monitors.filter((m) => m.id !== Number(params.id));
        return HttpResponse.json({ message: 'deleted' });
      }),
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    await renderList();
    await tile(1);
    await user.click(screen.getByRole('button', { name: 'List view' }));

    await user.click(within(await tile(1)).getByRole('button', { name: 'Delete Front Door' }));
    await waitFor(() => expect(deleted).toEqual(['1']));
  });

  it('reports a failed clone instead of pretending it worked', async () => {
    server.use(
      http.post('/api/v3/monitors', () =>
        HttpResponse.json({ error_message: 'storage full', code: 500 }, { status: 500 }),
      ),
    );
    const user = userEvent.setup();
    await renderList();
    const card = await tile(1);

    await user.click(within(card).getByRole('button', { name: 'Clone Front Door' }));

    expect(await screen.findByText(/storage full/)).toBeInTheDocument();
  });
});

describe('Monitors list — Add dialog', () => {
  it('opens from ?new=true and reflects the param in the router', async () => {
    const { router } = await renderList('/monitors?new=true');

    expect(await screen.findByRole('dialog', { name: 'Add monitor' })).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ new: true });
  });

  it('accepts the legacy ?new=1 spelling', async () => {
    const { router } = await renderList('/monitors?new=1');

    expect(await screen.findByRole('dialog', { name: 'Add monitor' })).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ new: true });
  });

  it('stays closed without the param, opens from the toolbar and closes again', async () => {
    const user = userEvent.setup();
    const { router } = await renderList();
    await tile(1);

    expect(router.state.location.search).toEqual({});
    expect(screen.queryByRole('dialog', { name: 'Add monitor' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add monitor' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add monitor' });

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Add monitor' })).not.toBeInTheDocument(),
    );
  });

  it('creates a monitor and refreshes the list', async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post('/api/v3/monitors', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        const created = makeMonitor({ ...(body as Partial<Monitor>), id: 9 });
        db.monitors.push(created);
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    await renderList('/monitors?new=true');
    const dialog = await screen.findByRole('dialog', { name: 'Add monitor' });

    await user.type(within(dialog).getByPlaceholderText('Front Door'), 'Back Gate');
    await user.click(within(dialog).getByRole('button', { name: /Create monitor/i }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body!.name).toBe('Back Gate');
    expect(body!.type).toBe('Ffmpeg');
    expect(body!.width).toBe(1920);
    expect(body!.height).toBe(1080);
    expect(await screen.findByText('Monitor "Back Gate" created.')).toBeInTheDocument();
  });

  it('refuses to submit without a name', async () => {
    let posted = false;
    server.use(
      http.post('/api/v3/monitors', () => {
        posted = true;
        return HttpResponse.json(makeMonitor({ id: 9 }), { status: 201 });
      }),
    );
    const user = userEvent.setup();
    await renderList('/monitors?new=true');
    const dialog = await screen.findByRole('dialog', { name: 'Add monitor' });

    const create = within(dialog).getByRole('button', { name: /Create monitor/i });
    expect(create).toBeDisabled();
    await user.click(create);
    expect(posted).toBe(false);

    // A name unblocks it; blanking it out blocks it again.
    await user.type(within(dialog).getByPlaceholderText('Front Door'), 'Back Gate');
    expect(create).toBeEnabled();
    await user.clear(within(dialog).getByPlaceholderText('Front Door'));
    expect(create).toBeDisabled();
  });

  it('rejects a zero resolution before it reaches the API', async () => {
    let posted = false;
    server.use(
      http.post('/api/v3/monitors', () => {
        posted = true;
        return HttpResponse.json(makeMonitor({ id: 9 }), { status: 201 });
      }),
    );
    const user = userEvent.setup();
    await renderList('/monitors?new=true');
    const dialog = await screen.findByRole('dialog', { name: 'Add monitor' });

    await user.type(within(dialog).getByPlaceholderText('Front Door'), 'Back Gate');
    const width = within(dialog).getByRole('spinbutton', { name: 'Width (px)' });
    await user.clear(width);
    await user.type(width, '0');
    await user.click(within(dialog).getByRole('button', { name: /Create monitor/i }));

    expect(await within(dialog).findByText('Fix the highlighted fields first.')).toBeInTheDocument();
    expect(within(dialog).getByText('Must be at least 1.')).toBeInTheDocument();
    expect(posted).toBe(false);
  });
});

describe('Monitors list — pagination', () => {
  const page1 = Array.from({ length: 24 }, (_, i) =>
    makeMonitor({ id: i + 1, name: `Cam ${i + 1}`, sequence: i + 1 }),
  );
  const page2 = [makeMonitor({ id: 25, name: 'Cam 25', sequence: 25 })];

  function seedTwoPages(seen: string[]) {
    server.use(
      http.get('/api/v3/monitors', ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? '1';
        seen.push(page);
        return HttpResponse.json(
          paginated(page === '1' ? page1 : page2, {
            total: 25,
            per_page: 24,
            current_page: Number(page),
            last_page: 2,
          }),
        );
      }),
    );
  }

  it('walks pages with the numbered and next/previous controls', async () => {
    const seen: string[] = [];
    seedTwoPages(seen);
    const user = userEvent.setup();
    await renderList();
    await tile(1);

    // The pager unmounts while the next page loads, so re-query it each time
    // rather than holding a detached node.
    const pager = () => screen.getByRole('navigation', { name: 'Pagination' });

    expect(within(pager()).getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(within(pager()).getByRole('button', { name: 'Page 1' }))
      .toHaveAttribute('aria-current', 'page');

    await user.click(within(pager()).getByRole('button', { name: 'Page 2' }));
    await waitFor(() => expect(seen).toContain('2'));
    expect(await tile(25)).toBeInTheDocument();
    await waitFor(() =>
      expect(within(pager()).getByRole('button', { name: 'Next page' })).toBeDisabled(),
    );
    expect(within(pager()).getByRole('button', { name: 'Page 2' }))
      .toHaveAttribute('aria-current', 'page');

    await user.click(within(pager()).getByRole('button', { name: 'Previous page' }));
    expect(await tile(1)).toBeInTheDocument();
    expect(seen.filter((p) => p === '1').length).toBeGreaterThan(1);
  });

  it('slides the five-page window as the operator moves through a long fleet', async () => {
    server.use(
      http.get('/api/v3/monitors', ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page') ?? 1);
        return HttpResponse.json(
          paginated([makeMonitor({ id: 100 + page, name: `Cam p${page}` })], {
            total: 240, per_page: 24, current_page: page, last_page: 10,
          }),
        );
      }),
    );
    const user = userEvent.setup();
    await renderList();
    await tile(101);

    const pager = () => screen.getByRole('navigation', { name: 'Pagination' });
    const pageNumbers = () =>
      within(pager())
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label'))
        .filter((l): l is string => !!l && l.startsWith('Page '));

    // page <= 3: window pinned to the start.
    expect(pageNumbers()).toEqual(['Page 1', 'Page 2', 'Page 3', 'Page 4', 'Page 5']);

    // Middle of the run: window centres on the current page.
    await user.click(within(pager()).getByRole('button', { name: 'Page 5' }));
    await tile(105);
    await waitFor(() =>
      expect(pageNumbers()).toEqual(['Page 3', 'Page 4', 'Page 5', 'Page 6', 'Page 7']),
    );

    // Near the end: window pins to the last five.
    await user.click(within(pager()).getByRole('button', { name: 'Page 7' }));
    await tile(107);
    await user.click(within(pager()).getByRole('button', { name: 'Next page' }));
    await tile(108);
    await waitFor(() =>
      expect(pageNumbers()).toEqual(['Page 6', 'Page 7', 'Page 8', 'Page 9', 'Page 10']),
    );
  });

  it('hides the pager on a single page', async () => {
    await renderList();
    await tile(1);
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
  });
});
