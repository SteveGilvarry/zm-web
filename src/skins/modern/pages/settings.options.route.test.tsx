/**
 * Settings → Options through the real router.
 *
 * `settings.options.test.tsx` mounts the page with a stubbed router and
 * covers the config table and the category rail's own state. This file
 * drives what needs the real one: the `?category=` round-trip, the
 * confirm-guarded system actions and their POST bodies, the daemon
 * controls, the park-and-discard flow for unsaved rows, and the
 * `system: Edit` gate.
 */
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { renderRoute } from '@/test/renderRoute';
import { setupMockServer, server, db } from '@/test/msw/server';
import { makeConfig, makeDaemon, makeSystemStatus } from '@/test/fixtures';

setupMockServer();

async function optionsPage() {
  await screen.findAllByRole('heading', { name: /^System Settings$/ });
  await screen.findByText('ZoneMinder Configuration');
}

/** A rail button carries its label and its row count, e.g. `Web1`. */
function categoryButton(label: string, count: number) {
  return screen.getByRole('button', { name: `${label}${count}` });
}

function allCategoriesButton() {
  return screen.getByRole('button', { name: /^All \d+$/ });
}

describe('Settings → Options — overview', () => {
  it('shows the version, run state and load bars', async () => {
    renderRoute('/settings');
    await optionsPage();

    // `version` and `db_version` are both 1.37.64 in the fixture.
    expect(await screen.findAllByText('1.37.64')).toHaveLength(2);
    expect(screen.getByText('3.0.0')).toBeInTheDocument();
    expect(screen.getAllByText('Running').length).toBeGreaterThan(0);
    // The header status strip carries a CPU readout too; the panel adds
    // the load average alongside it.
    expect(screen.getAllByText('CPU').length).toBeGreaterThan(0);
    expect(screen.getByText('Load: 1.20')).toBeInTheDocument();
    expect(screen.getAllByText('7.5 GB / 14.9 GB').length).toBeGreaterThan(0);
  });

  it('reports a stopped ZoneMinder', async () => {
    db.systemStatus = makeSystemStatus({ running: false });
    renderRoute('/settings');
    await optionsPage();
    expect((await screen.findAllByText('Stopped')).length).toBeGreaterThan(0);
  });

  it('lists the configs and shows the error state when they fail to load', async () => {
    server.use(http.get('/api/v3/configs', () => new HttpResponse(null, { status: 500 })));
    renderRoute('/settings');
    await optionsPage();
    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('shows an empty state when the backend has no configs', async () => {
    db.configs = [];
    renderRoute('/settings');
    await optionsPage();
    expect(await screen.findByText('No configs found')).toBeInTheDocument();
  });
});

describe('Settings → Options — category rail', () => {
  it('opens the category named in ?category= and lists only its rows', async () => {
    renderRoute('/settings?category=web');
    await optionsPage();

    expect(await screen.findByText('ZM_WEB_TITLE')).toBeInTheDocument();
    expect(screen.queryByText('ZM_OPT_USE_AUTH')).not.toBeInTheDocument();
  });

  it('falls back to All for a category the backend does not serve', async () => {
    renderRoute('/settings?category=nonsense');
    await optionsPage();

    expect(await screen.findByText('ZM_WEB_TITLE')).toBeInTheDocument();
    expect(screen.getByText('ZM_OPT_USE_AUTH')).toBeInTheDocument();
  });

  it('writes the picked category into the URL and clears it again on All', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/settings');
    await optionsPage();
    await screen.findByText('ZM_WEB_TITLE');

    await user.click(categoryButton('Web', 1));
    await waitFor(() => expect(router.state.location.search).toEqual({ category: 'web' }));
    expect(screen.queryByText('ZM_OPT_USE_AUTH')).not.toBeInTheDocument();

    await user.click(allCategoriesButton());
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(await screen.findByText('ZM_OPT_USE_AUTH')).toBeInTheDocument();
  });

  it('filters the visible rows by the search box', async () => {
    const user = userEvent.setup();
    renderRoute('/settings');
    await optionsPage();
    await screen.findByText('ZM_WEB_TITLE');

    await user.type(screen.getByPlaceholderText('Search all configs...'), 'USE_AUTH');

    expect(await screen.findByText('ZM_OPT_USE_AUTH')).toBeInTheDocument();
    expect(screen.queryByText('ZM_WEB_TITLE')).not.toBeInTheDocument();
  });
});

describe('Settings → Options — unsaved rows', () => {
  it('parks an abandoned edit, then discards it on request', async () => {
    const user = userEvent.setup();
    renderRoute('/settings');
    await optionsPage();

    await user.click(await screen.findByTitle('ZoneMinder'));
    const input = await screen.findByDisplayValue('ZoneMinder');
    await user.clear(input);
    // Escape leaves the editor without writing — but the typed value is
    // parked, not dropped, so the row still counts as unsaved.
    await user.type(input, 'Site A{Escape}');

    expect(await screen.findByTitle('Site A')).toBeInTheDocument();
    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent('1 unsaved change');

    await user.click(within(banner).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.getByTitle('ZoneMinder')).toBeInTheDocument();
  });

  it('writes every parked row in one go on Save all', async () => {
    const puts: Array<{ name: string; body: unknown }> = [];
    server.use(
      http.put('/api/v3/configs/:name', async ({ request, params }) => {
        puts.push({ name: String(params.name), body: await request.json() });
        return HttpResponse.json(makeConfig({ name: String(params.name), value: 'Site A' }));
      }),
    );

    const user = userEvent.setup();
    renderRoute('/settings');
    await optionsPage();

    await user.click(await screen.findByTitle('ZoneMinder'));
    const input = await screen.findByDisplayValue('ZoneMinder');
    await user.clear(input);
    await user.type(input, 'Site A{Escape}');

    const banner = await screen.findByRole('status');
    await user.click(within(banner).getByRole('button', { name: 'Save all' }));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ name: 'ZM_WEB_TITLE', body: { value: 'Site A' } });
  });
});

describe('Settings → Options — system actions', () => {
  it.each([
    ['Start ZoneMinder', 'Confirm', '/api/v3/system/startup'],
    ['Stop ZoneMinder', 'Stop', '/api/v3/system/shutdown'],
    ['Restart ZoneMinder', 'Confirm', '/api/v3/system/restart'],
    ['Rotate Logs', 'Confirm', '/api/v3/system/logrot'],
  ])('%s asks first, then POSTs %s', async (action, confirmLabel, path) => {
    let posted = false;
    server.use(http.post(path, () => { posted = true; return HttpResponse.json({ message: 'ok' }); }));

    const user = userEvent.setup();
    renderRoute('/settings');
    await optionsPage();

    await user.click(screen.getByRole('button', { name: action }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: action })).toBeInTheDocument();
    expect(posted).toBe(false);

    await user.click(within(dialog).getByRole('button', { name: confirmLabel }));
    await waitFor(() => expect(posted).toBe(true));
  });

  it('sends nothing when the confirm is dismissed', async () => {
    let posted = false;
    server.use(
      http.post('/api/v3/system/restart', () => {
        posted = true;
        return HttpResponse.json({ message: 'ok' });
      }),
    );

    const user = userEvent.setup();
    renderRoute('/settings');
    await optionsPage();

    await user.click(screen.getByRole('button', { name: 'Restart ZoneMinder' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(posted).toBe(false);
  });
});

describe('Settings → Options — daemon control', () => {
  it('stops and restarts a running daemon by name', async () => {
    const hits: string[] = [];
    server.use(
      http.post('/api/v3/daemons/:name/:action', ({ params }) => {
        hits.push(`${params.name}:${params.action}`);
        return HttpResponse.json({ message: 'ok' });
      }),
    );

    const user = userEvent.setup();
    renderRoute('/settings');
    await optionsPage();

    expect(await screen.findByText('zmc -m 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Restart' }));
    await waitFor(() => expect(hits).toEqual(['zmc -m 1:restart']));

    await user.click(screen.getByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(hits).toHaveLength(2));
    expect(hits[1]).toBe('zmc -m 1:stop');
  });

  it('offers Start for a stopped daemon', async () => {
    db.systemStatus = makeSystemStatus({
      daemons: [makeDaemon({ id: 'zma_m1', name: 'zma -m 1', state: 'stopped' })],
    });
    const hits: string[] = [];
    server.use(
      http.post('/api/v3/daemons/:name/:action', ({ params }) => {
        hits.push(`${params.name}:${params.action}`);
        return HttpResponse.json({ message: 'ok' });
      }),
    );

    const user = userEvent.setup();
    renderRoute('/settings');
    await optionsPage();
    await screen.findByText('zma -m 1');

    await user.click(screen.getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(hits).toEqual(['zma -m 1:start']));
  });

  it('says so when there are no daemons', async () => {
    db.systemStatus = makeSystemStatus({ daemons: [] });
    renderRoute('/settings');
    await optionsPage();
    expect(await screen.findByText('No daemons configured')).toBeInTheDocument();
  });
});

describe('Settings → Options — permissions', () => {
  it('hides the system actions from an operator with only View', async () => {
    renderRoute('/settings', { perms: { system: 'View' } });
    await optionsPage();

    expect(await screen.findByText('You do not have permission to view this.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start ZoneMinder' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop ZoneMinder' })).not.toBeInTheDocument();
  });

  it('makes the config rows read-only for that operator', async () => {
    const user = userEvent.setup();
    renderRoute('/settings', { perms: { system: 'View' } });
    await optionsPage();

    await user.click(await screen.findByTitle('ZoneMinder'));
    expect(screen.queryByDisplayValue('ZoneMinder')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText('Read-only').length).toBeGreaterThan(0);
  });

  it('disables the daemon controls for that operator', async () => {
    renderRoute('/settings', { perms: { system: 'View' } });
    await optionsPage();
    await screen.findByText('zmc -m 1');
    expect(screen.getByRole('button', { name: 'Restart' })).toBeDisabled();
  });
});
