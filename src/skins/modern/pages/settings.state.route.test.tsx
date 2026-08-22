/**
 * Run State through the real router.
 *
 * `settings.state.test.tsx` covers the daemon supervisor and the save-current
 * flow against a stubbed router. This file picks up the per-row work it does
 * not reach — rename, the expandable definition preview, delete, apply — plus
 * the permission and error states.
 */
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { renderRoute } from '@/test/renderRoute';
import { setupMockServer, server, db } from '@/test/msw/server';
import { makeMonitor, makeState, paginated } from '@/test/fixtures';

setupMockServer();

async function runStatePage() {
  await screen.findAllByRole('heading', { name: /^Run State$/ });
}

describe('Run State — saved states', () => {
  it('lists the saved states and marks the active one', async () => {
    renderRoute('/settings/state');
    await runStatePage();
    expect(await screen.findByText('default')).toBeInTheDocument();
    expect(screen.getByText('away')).toBeInTheDocument();
  });

  it('shows an empty state when nothing is saved', async () => {
    db.states = [];
    renderRoute('/settings/state');
    await runStatePage();
    expect(await screen.findByText(/no saved states/i)).toBeInTheDocument();
  });

  it('shows the error state when the states request fails', async () => {
    server.use(http.get('/api/v3/states', () => new HttpResponse(null, { status: 500 })));
    renderRoute('/settings/state');
    await runStatePage();
    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('expands a state to show its per-monitor definition, resolving monitor names', async () => {
    db.states = [makeState({ id: 2, name: 'away', is_active: 0, definition: '1:Always:None:None,9:None:None:None' })];
    db.monitors = [makeMonitor({ id: 1, name: 'Front Door' })];

    const user = userEvent.setup();
    renderRoute('/settings/state');
    await runStatePage();

    await user.click(await screen.findByRole('button', { name: /Show definition of away/i }));

    const table = await screen.findByRole('table', { name: /Definition of away/i });
    expect(within(table).getByText('Front Door')).toBeInTheDocument();
    // A monitor id the definition names but the system no longer has.
    expect(within(table).getByText(/no longer exists/i)).toBeInTheDocument();
  });

  it('renames a state with one PATCH when Enter is pressed', async () => {
    db.states = [makeState({ id: 2, name: 'away', is_active: 0 })];
    let patched: { id?: string; body?: unknown } = {};
    server.use(
      http.patch('/api/v3/states/:id', async ({ request, params }) => {
        patched = { id: String(params.id), body: await request.json() };
        return HttpResponse.json(makeState({ id: 2, name: 'holiday' }));
      }),
    );

    const user = userEvent.setup();
    renderRoute('/settings/state');
    await runStatePage();

    await user.click(await screen.findByRole('button', { name: /^Rename away$/i }));
    const input = await screen.findByRole('textbox', { name: /New name for away/i });
    await user.clear(input);
    await user.type(input, 'holiday{Enter}');

    await waitFor(() => expect(patched.id).toBe('2'));
    expect(patched.body).toMatchObject({ name: 'holiday' });
  });

  it('abandons a rename on Escape without any request', async () => {
    db.states = [makeState({ id: 2, name: 'away', is_active: 0 })];
    const patches: string[] = [];
    server.use(
      http.patch('/api/v3/states/:id', ({ params }) => {
        patches.push(String(params.id));
        return HttpResponse.json(makeState({ id: 2 }));
      }),
    );

    const user = userEvent.setup();
    renderRoute('/settings/state');
    await runStatePage();

    await user.click(await screen.findByRole('button', { name: /^Rename away$/i }));
    const input = await screen.findByRole('textbox', { name: /New name for away/i });
    await user.type(input, 'x{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: /New name for away/i })).not.toBeInTheDocument(),
    );
    expect(patches).toEqual([]);
  });

  it('confirms before deleting, then DELETEs the state', async () => {
    db.states = [makeState({ id: 2, name: 'away', is_active: 0 })];
    let deleted: string | null = null;
    server.use(
      http.delete('/api/v3/states/:id', ({ params }) => {
        deleted = String(params.id);
        return HttpResponse.json({ message: 'deleted' });
      }),
    );

    const user = userEvent.setup();
    renderRoute('/settings/state');
    await runStatePage();

    await user.click(await screen.findByRole('button', { name: /^Delete state away$/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/does not change any monitor/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /^Delete$/ }));

    await waitFor(() => expect(deleted).toBe('2'));
  });

  it('confirms before applying a state, then POSTs it', async () => {
    db.states = [makeState({ id: 2, name: 'away', is_active: 0 })];
    let applied: { state_name?: string } | null = null;
    server.use(
      http.post('/api/v3/system/state', async ({ request }) => {
        applied = (await request.json()) as { state_name?: string };
        return HttpResponse.json({ success: true, message: 'ok' });
      }),
    );

    const user = userEvent.setup();
    renderRoute('/settings/state');
    await runStatePage();

    await user.click(await screen.findByRole('button', { name: /^Apply state away$/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /apply/i }));

    await waitFor(() => expect(applied).toEqual({ state_name: 'away' }));
  });
});

describe('Run State — permissions', () => {
  it('hides rename, delete and the save-current form without system Edit', async () => {
    db.states = [makeState({ id: 2, name: 'away', is_active: 0 })];
    renderRoute('/settings/state', { perms: { system: 'View' } });
    await runStatePage();
    await screen.findByText('away');

    expect(screen.queryByRole('button', { name: /^Rename away$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete state away$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /New state name/i })).not.toBeInTheDocument();
  });

  it('offers them with system Edit', async () => {
    db.states = [makeState({ id: 2, name: 'away', is_active: 0 })];
    renderRoute('/settings/state');
    await runStatePage();
    expect(await screen.findByRole('button', { name: /^Rename away$/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /New state name/i })).toBeInTheDocument();
  });
});

describe('Run State — envelope', () => {
  it('reads the states out of the {items,total,…} envelope', async () => {
    server.use(
      http.get('/api/v3/states', () =>
        HttpResponse.json(paginated([makeState({ id: 5, name: 'night' })], { total: 1 })),
      ),
    );
    renderRoute('/settings/state');
    await runStatePage();
    expect(await screen.findByText('night')).toBeInTheDocument();
  });
});
