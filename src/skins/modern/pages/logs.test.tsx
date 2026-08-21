/**
 * Route-level tests for the modern-skin log viewer (`/logs`).
 *
 * Everything here goes through the real router, so `validateSearch` and the
 * hook's `navigate({ replace: true })` round-trip are exercised for real:
 * a chip click has to end up in `router.state.location.search`, and a URL
 * with params has to paint the matching controls.
 *
 * The seeded store (`src/test/msw/handlers.ts`) holds two rows — an INFO
 * `zmc_m1` "Starting capture" and an ERROR `zma_m1` "Shared data size
 * conflict". Every filter is a query param the mock honours the way the
 * backend does (zm-api#21), so these assert the request as well as the
 * rows that come back.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { renderRoute } from '@/test/renderRoute';
import { setupMockServer, server, db } from '@/test/msw/server';
import { makeLog, makeServer, paginated } from '@/test/fixtures';

setupMockServer();

beforeEach(() => {
  // Column + page-size picks persist in localStorage; start every test from
  // the shipped defaults.
  window.localStorage.clear();
});

/** Wait for the table to paint (the page is lazy, first frame is Suspense). */
async function findTable(): Promise<HTMLElement> {
  return screen.findByRole('table');
}

/** The severity-threshold chip row ("this level or worse"). */
function levelChips(): HTMLElement {
  return screen.getByRole('group', { name: 'Minimum level' });
}

describe('LogsPage (modern) — rendering', () => {
  it('renders the seeded rows with their level labels and default columns', async () => {
    renderRoute('/logs');

    const table = await findTable();
    expect(
      within(table).getAllByRole('columnheader').map((th) => th.textContent),
    ).toEqual(['Timestamp', 'Level', 'Component', 'PID', 'Message']);

    expect(within(table).getByText('Starting capture')).toBeInTheDocument();
    expect(within(table).getByText('Shared data size conflict')).toBeInTheDocument();
    expect(within(table).getByText('zmc_m1')).toBeInTheDocument();
    expect(within(table).getByText('zma_m1')).toBeInTheDocument();
    expect(within(table).getByText('INFO')).toBeInTheDocument();
    expect(within(table).getByText('ERROR')).toBeInTheDocument();
    // PID column.
    expect(within(table).getAllByText('4242')).toHaveLength(2);
  });

  it('counts the page by severity in the summary strip', async () => {
    renderRoute('/logs');
    await findTable();

    const strip = screen.getByRole('region', { name: 'Logs summary' });
    expect(within(strip).getByRole('button', { name: 'Errors: 1' })).toBeInTheDocument();
    expect(within(strip).getByRole('button', { name: 'Warnings: 0' })).toBeInTheDocument();
    expect(within(strip).getByRole('button', { name: 'Info: 1' })).toBeInTheDocument();
    expect(within(strip).getByText('Total: 2 · Displaying: 1–2')).toBeInTheDocument();
  });

  it('shows the empty message when the server has no log rows', async () => {
    db.logs = [];
    renderRoute('/logs');

    expect(
      await screen.findByText('No log entries match the current filters.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the error state — not a crash — when /logs 500s', async () => {
    server.use(
      http.get('/api/v3/logs', () =>
        HttpResponse.json({ error_message: 'boom', code: 500 }, { status: 500 }),
      ),
    );
    renderRoute('/logs');

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Cannot reach the server.')).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('retries the query from the error state', async () => {
    let calls = 0;
    server.use(
      http.get('/api/v3/logs', () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json({ error_message: 'boom', code: 500 }, { status: 500 });
        }
        return HttpResponse.json(paginated(db.logs, { total: db.logs.length }));
      }),
    );
    const user = userEvent.setup();
    renderRoute('/logs');

    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Starting capture')).toBeInTheDocument();
  });
});

describe('LogsPage (modern) — severity rendering', () => {
  it('labels every rung of the ZoneMinder scale and fills the sparse columns', async () => {
    // Persisted column pick — the hook restores it on mount.
    window.localStorage.setItem(
      'zm-dashboard.logs.columns',
      JSON.stringify(['timestamp', 'level', 'component', 'server', 'pid', 'file', 'line', 'message']),
    );
    db.logs = [
      makeLog({ id: 1, level: -4, code: 'PNC', message: 'Panic' }),
      makeLog({ id: 2, level: -3, code: 'FAT', message: 'Fatal' }),
      makeLog({ id: 3, level: -1, code: 'WAR', message: 'Warning' }),
      makeLog({ id: 4, level: 1, code: 'DBG', message: 'Debug' }),
      makeLog({ id: 5, level: 5, code: 'DB5', message: 'Deep debug', server_id: 99 }),
      makeLog({ id: 6, level: 0, message: 'Sparse', pid: null, file: null, line: null }),
    ];
    renderRoute('/logs');

    const table = await findTable();
    for (const label of ['PANIC', 'FATAL', 'WARNING', 'DEBUG', 'DEBUG 5', 'INFO']) {
      expect(within(table).getByText(label)).toBeInTheDocument();
    }
    // No server row matches id 99, so the id itself is shown.
    expect(within(table).getByText('Server 99')).toBeInTheDocument();
    // The sparse row's PID / file / line cells fall back to an em dash.
    const sparse = within(table).getByText('Sparse').closest('tr')!;
    expect(within(sparse).getAllByText('—')).toHaveLength(4);
  });
});

describe('LogsPage (modern) — level chips', () => {
  it('pushes the severity threshold into the URL and the request', async () => {
    const seen: Array<string | null> = [];
    server.use(
      http.get('/api/v3/logs', ({ request }) => {
        const url = new URL(request.url);
        seen.push(url.searchParams.get('min_level'));
        const rows = url.searchParams.get('min_level') === 'error'
          ? db.logs.filter((l) => l.level <= -2)
          : db.logs;
        return HttpResponse.json(paginated(rows, { total: rows.length }));
      }),
    );
    const user = userEvent.setup();
    const { router } = renderRoute('/logs');
    await findTable();

    await user.click(within(levelChips()).getByRole('button', { name: 'Error' }));

    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ min_level: 'error' });
    });
    await waitFor(() => expect(seen).toContain('error'));
    await waitFor(() => {
      expect(screen.queryByText('Starting capture')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Shared data size conflict')).toBeInTheDocument();
    // No "current page only" caveat left to print.
    expect(screen.queryByTestId('logs-page-local-note')).not.toBeInTheDocument();
  });

  it('means "this level or worse": warning keeps the error row too', async () => {
    const user = userEvent.setup();
    renderRoute('/logs');
    await findTable();

    await user.click(within(levelChips()).getByRole('button', { name: 'Warning' }));
    await waitFor(() => {
      expect(screen.queryByText('Starting capture')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Shared data size conflict')).toBeInTheDocument();
  });

  it('reflects ?min_level= from the URL on the chip and the table', async () => {
    renderRoute('/logs?min_level=error');

    const table = await findTable();
    expect(within(table).getByText('Shared data size conflict')).toBeInTheDocument();
    expect(within(table).queryByText('Starting capture')).not.toBeInTheDocument();
    expect(within(levelChips()).getByRole('button', { name: 'Error' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('drops an unknown min_level rather than sending it on to a 400', async () => {
    const seen: Array<string | null> = [];
    server.use(
      http.get('/api/v3/logs', ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('min_level'));
        return HttpResponse.json(paginated(db.logs, { total: db.logs.length }));
      }),
    );
    renderRoute('/logs?min_level=panic');
    await findTable();
    expect(seen).toEqual([null]);
  });

  it('toggles the threshold off when the active summary card is clicked again', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/logs?min_level=error');
    await findTable();

    const strip = screen.getByRole('region', { name: 'Logs summary' });
    const errors = within(strip).getByRole('button', { name: 'Errors: 1' });
    expect(errors).toHaveAttribute('aria-pressed', 'true');

    await user.click(errors);
    await waitFor(() => {
      expect(router.state.location.search).not.toHaveProperty('min_level');
    });
    expect(await screen.findByText('Starting capture')).toBeInTheDocument();
  });

  it('filters to warnings and worse from the summary card', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/logs');
    await findTable();

    const strip = screen.getByRole('region', { name: 'Logs summary' });
    await user.click(within(strip).getByRole('button', { name: 'Warnings: 0' }));

    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ min_level: 'warning' });
    });
  });
});

describe('LogsPage (modern) — sort and clear', () => {
  it('flips the timestamp column between desc and asc, with aria-sort', async () => {
    const seen: Array<string | null> = [];
    server.use(
      http.get('/api/v3/logs', ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('sort'));
        return HttpResponse.json(paginated(db.logs, { total: db.logs.length }));
      }),
    );
    const user = userEvent.setup();
    const { router } = renderRoute('/logs');
    const table = await findTable();

    const header = within(table).getByRole('columnheader', { name: /Timestamp/ });
    expect(header).toHaveAttribute('aria-sort', 'descending');

    await user.click(within(header).getByRole('button', { name: 'Sort by timestamp' }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ sort: 'asc' }));
    await waitFor(() => expect(seen).toContain('asc'));
    expect(
      within(screen.getByRole('table')).getByRole('columnheader', { name: /Timestamp/ }),
    ).toHaveAttribute('aria-sort', 'ascending');
  });

  it('clears the logs behind a confirmation, scoped to the filters on screen', async () => {
    let deleted: URLSearchParams | null = null;
    server.use(
      http.delete('/api/v3/logs', ({ request }) => {
        deleted = new URL(request.url).searchParams;
        db.logs = [];
        return HttpResponse.json({ message: 'Deleted 2 log entries' });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/logs?component=zmc_m1');
    await findTable();

    await user.click(screen.getByRole('button', { name: 'Clear Logs' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/matching the filters on screen/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Clear Logs' }));
    expect(await screen.findByText('Deleted 2 log entries')).toBeInTheDocument();
    expect(deleted!.get('component')).toBe('zmc_m1');
  });

  it('warns that an unfiltered clear takes the whole table', async () => {
    const user = userEvent.setup();
    renderRoute('/logs');
    await findTable();

    await user.click(screen.getByRole('button', { name: 'Clear Logs' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/every row in the log table/)).toBeInTheDocument();
  });
});

describe('LogsPage (modern) — filters', () => {
  it('round-trips the component picker through the URL and the request', async () => {
    const seen: Array<string | null> = [];
    server.use(
      http.get('/api/v3/logs', ({ request }) => {
        const component = new URL(request.url).searchParams.get('component');
        seen.push(component);
        const rows = component ? db.logs.filter((l) => l.component === component) : db.logs;
        return HttpResponse.json(paginated(rows, { total: rows.length }));
      }),
    );
    const user = userEvent.setup();
    const { router } = renderRoute('/logs');
    await findTable();

    await user.selectOptions(screen.getByLabelText('Component filter'), 'zma_m1');

    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ component: 'zma_m1' });
    });
    await waitFor(() => expect(seen).toContain('zma_m1'));
    await waitFor(() => {
      expect(screen.queryByText('Starting capture')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Shared data size conflict')).toBeInTheDocument();
  });

  it('reflects ?component= from the URL on the picker', async () => {
    renderRoute('/logs?component=zmc_m1');
    await findTable();
    expect(screen.getByLabelText('Component filter')).toHaveValue('zmc_m1');
  });

  it('commits the message search to ?q= on Enter and narrows the rows', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/logs');
    await findTable();

    const box = screen.getByLabelText('Search messages');
    await user.type(box, 'shared{Enter}');

    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ q: 'shared' });
    });
    expect(screen.getByText('Shared data size conflict')).toBeInTheDocument();
    expect(screen.queryByText('Starting capture')).not.toBeInTheDocument();
  });

  it('commits the message search on blur too', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/logs');
    await findTable();

    await user.type(screen.getByLabelText('Search messages'), 'capture');
    await user.tab();

    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ q: 'capture' });
    });
  });

  it('reflects ?q= from the URL in the search box', async () => {
    renderRoute('/logs?q=conflict');
    await findTable();
    expect(screen.getByLabelText('Search messages')).toHaveValue('conflict');
    expect(screen.queryByText('Starting capture')).not.toBeInTheDocument();
  });

  it('sends the date range as Unix-second bounds and reports an empty result', async () => {
    const seen: Array<string | null> = [];
    server.use(
      http.get('/api/v3/logs', ({ request }) => {
        const url = new URL(request.url);
        seen.push(url.searchParams.get('end'));
        const end = url.searchParams.get('end');
        const rows = end ? [] : db.logs;
        return HttpResponse.json(paginated(rows, { total: rows.length }));
      }),
    );
    const user = userEvent.setup();
    const { router } = renderRoute('/logs');
    await findTable();

    // Every seeded row is stamped 2026; an end bound in 2020 excludes them all.
    await user.type(screen.getByLabelText('End date'), '2020-01-01T00:00');

    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ end: '2020-01-01T00:00' });
    });
    // Whole seconds, not milliseconds.
    await waitFor(() => expect(seen.at(-1)).toBe(String(Date.parse('2020-01-01T00:00') / 1000)));
    expect(
      await screen.findByText('No log entries match the current filters.'),
    ).toBeInTheDocument();
  });

  it('keeps a start bound that includes every row', async () => {
    const user = userEvent.setup();
    const { router } = renderRoute('/logs');
    await findTable();

    await user.type(screen.getByLabelText('Start date'), '2020-01-01T00:00');

    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ start: '2020-01-01T00:00' });
    });
    expect(screen.getByText('Starting capture')).toBeInTheDocument();
  });
});

describe('LogsPage (modern) — server filter', () => {
  it('hides the server picker on a single-server install', async () => {
    renderRoute('/logs');
    await findTable();
    expect(screen.queryByLabelText('Server filter')).not.toBeInTheDocument();
  });

  it('offers the picker on a cluster and round-trips ?server_id=', async () => {
    db.servers = [
      makeServer({ id: 1, name: 'zm-node-1' }),
      makeServer({ id: 2, name: 'zm-node-2' }),
    ];
    db.logs = [makeLog({ id: 1, server_id: 2 })];
    const seen: Array<string | null> = [];
    server.use(
      http.get('/api/v3/logs', ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('server_id'));
        return HttpResponse.json(paginated(db.logs, { total: db.logs.length }));
      }),
    );
    const user = userEvent.setup();
    const { router } = renderRoute('/logs');
    await findTable();

    const picker = await screen.findByLabelText('Server filter');
    await user.selectOptions(picker, 'zm-node-2');

    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ server_id: 2 });
    });
    await waitFor(() => expect(seen).toContain('2'));
  });

  it('names the server in the Server column when that column is shown', async () => {
    db.servers = [
      makeServer({ id: 1, name: 'zm-node-1' }),
      makeServer({ id: 2, name: 'zm-node-2' }),
    ];
    db.logs = [makeLog({ id: 1, server_id: 2 })];
    const user = userEvent.setup();
    renderRoute('/logs');
    await findTable();

    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(screen.getByRole('checkbox', { name: 'Toggle Server column' }));

    const table = screen.getByRole('table');
    await waitFor(() => {
      expect(within(table).getByText('zm-node-2')).toBeInTheDocument();
    });
  });
});

describe('LogsPage (modern) — columns', () => {
  it('adds a column from the picker and persists the choice', async () => {
    const user = userEvent.setup();
    renderRoute('/logs');
    const table = await findTable();

    expect(within(table).queryByRole('columnheader', { name: 'Line' })).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'Columns' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.click(
      within(screen.getByRole('menu', { name: 'Toggle columns' })).getByRole('checkbox', {
        name: 'Toggle Line column',
      }),
    );

    await waitFor(() => {
      expect(
        within(screen.getByRole('table')).getByRole('columnheader', { name: 'Line' }),
      ).toBeInTheDocument();
    });
    expect(
      JSON.parse(window.localStorage.getItem('zm-dashboard.logs.columns') ?? '[]'),
    ).toContain('line');
  });

  it('removes a column and closes the picker from the scrim', async () => {
    const user = userEvent.setup();
    renderRoute('/logs');
    await findTable();

    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await user.click(screen.getByRole('checkbox', { name: 'Toggle PID column' }));

    await waitFor(() => {
      expect(
        within(screen.getByRole('table')).queryByRole('columnheader', { name: 'PID' }),
      ).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Columns' }));
    expect(screen.queryByRole('menu', { name: 'Toggle columns' })).not.toBeInTheDocument();
  });
});

describe('LogsPage (modern) — pagination', () => {
  const manyLogs = () =>
    Array.from({ length: 60 }, (_, i) =>
      makeLog({ id: i + 1, message: `Row ${i + 1}`, component: 'zmc_m1' }),
    );

  it('pages forward through the URL', async () => {
    db.logs = manyLogs();
    const user = userEvent.setup();
    const { router } = renderRoute('/logs');
    await findTable();

    expect(screen.getByText('Page 1 / 2 · 60 entries')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Next page' }));

    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ page: 2 });
    });
    expect(await screen.findByText('Row 51')).toBeInTheDocument();
    expect(screen.queryByText('Row 1')).not.toBeInTheDocument();
  });

  it('reflects ?page= and steps back', async () => {
    db.logs = manyLogs();
    const user = userEvent.setup();
    const { router } = renderRoute('/logs?page=2');
    await findTable();

    expect(screen.getByText('Page 2 / 2 · 60 entries')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ page: 1 });
    });
    expect(await screen.findByText('Row 1')).toBeInTheDocument();
  });

  it('changes the page size, resets to page 1 and remembers the pick', async () => {
    db.logs = manyLogs();
    const user = userEvent.setup();
    const { router } = renderRoute('/logs?page=2');
    await findTable();

    await user.selectOptions(screen.getByLabelText('Rows per page'), '25');

    await waitFor(() => {
      expect(router.state.location.search).not.toHaveProperty('page');
    });
    expect(await screen.findByText('Page 1 / 3 · 60 entries')).toBeInTheDocument();
    expect(window.localStorage.getItem('zm-dashboard.logs.pageSize')).toBe('25');
  });
});

describe('LogsPage (modern) — toolbar actions', () => {
  it('refetches on Refresh', async () => {
    let calls = 0;
    server.use(
      http.get('/api/v3/logs', () => {
        calls += 1;
        return HttpResponse.json(paginated(db.logs, { total: db.logs.length }));
      }),
    );
    const user = userEvent.setup();
    renderRoute('/logs');
    await findTable();
    await waitFor(() => expect(calls).toBe(1));

    await user.click(screen.getByRole('button', { name: 'Refresh logs' }));
    await waitFor(() => expect(calls).toBe(2));
  });

  it('downloads the visible rows as CSV', async () => {
    const createObjectURL = vi.fn(() => 'blob:logs');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const clicked: HTMLAnchorElement[] = [];
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function mockClick(this: void) {
        // `click()` fires on the anchor `downloadCsv` just appended.
        const a = document.body.lastElementChild;
        if (a instanceof HTMLAnchorElement) clicked.push(a);
      });

    const user = userEvent.setup();
    renderRoute('/logs');
    await findTable();

    await user.click(screen.getByRole('button', { name: 'Download CSV' }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toMatch(/^zm-logs-.*\.csv$/);
    expect(clicked[0].href).toBe('blob:logs');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:logs');
    clickSpy.mockRestore();
  });

  it('disables the CSV button when nothing is on screen', async () => {
    db.logs = [];
    renderRoute('/logs');
    await screen.findByText('No log entries match the current filters.');
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeDisabled();
  });
});
