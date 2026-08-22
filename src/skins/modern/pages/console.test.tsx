/**
 * Console (`/`) in the modern skin, rendered through the real router.
 *
 * The page is the camera wall. One status line carries the readings and
 * hides the system detail and the filter chips behind disclosures; the
 * cameras fill the rest, with recent events in a rail beside them.
 * Everything comes from `useConsoleData`'s eight queries, so these tests
 * drive it end-to-end through MSW rather than stubbing the hook.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { renderRoute } from '@/test/renderRoute';
import { db, server, setupMockServer } from '@/test/msw/server';
import { makeMonitor, makeSystemStatus, makeSystemStats } from '@/test/fixtures';
import { useMonitorFilterStore } from '@/stores/monitorFilter';

setupMockServer();

beforeEach(() => {
  // The filter bar persists to sessionStorage, so selections would otherwise
  // leak from one test into the next.
  useMonitorFilterStore.getState().reset();
  window.sessionStorage.clear();
  window.localStorage.clear();

  // jsdom does no layout. The justified grid measures its container and
  // renders nothing until that width is > 0, so hand every element a
  // desktop-sized box. `restoreMocks: true` puts it back after each test.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 1280,
    height: 720,
    top: 0,
    left: 0,
    right: 1280,
    bottom: 720,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
});

/**
 * One reading in the console's status line, found by its label. Scoped to
 * the region: "Cameras" also names the wall.
 */
async function reading(label: string): Promise<HTMLElement> {
  const line = await screen.findByRole('region', { name: 'Console status' });
  return within(line).getByText(label).parentElement as HTMLElement;
}

/** The camera wall. */
function wall(): HTMLElement {
  return screen.getByRole('region', { name: 'Cameras' });
}

/** The recent-events rail. */
function rail(): HTMLElement {
  return screen.getByRole('complementary', { name: 'Recent Events' });
}

/** Opens one of the status line's disclosures and returns its panel. */
async function disclose(button: string): Promise<HTMLElement> {
  const user = userEvent.setup();
  const line = await screen.findByRole('region', { name: 'Console status' });
  await user.click(within(line).getByRole('button', { name: button }));
  return line;
}

async function renderConsole() {
  const rendered = renderRoute('/');
  expect((await screen.findAllByRole('heading', { name: /^Console$/ })).length)
    .toBeGreaterThan(0);
  return rendered;
}

describe('Console — renders with data', () => {
  it('summarises the fleet in the status line', async () => {
    await renderConsole();

    // Two seeded monitors, both capturing; only Front Door records.
    expect(within(await reading('Cameras')).getByText('2')).toBeInTheDocument();
    expect(within(await reading('Recording')).getByText('1')).toBeInTheDocument();
    expect(within(await reading('Events (24h)')).getByText('3')).toBeInTheDocument();
    expect(within(await reading('Alarms')).getByText('0')).toBeInTheDocument();

    // 500 GB of 1 TB used — under the 75% mark, so no colour.
    const disk = within(await reading('Disk')).getByText('50%');
    expect(disk).not.toHaveClass('text-warn');
    expect(disk).not.toHaveClass('text-danger');
  });

  it('renders one tile per monitor, linking into the watch page', async () => {
    await renderConsole();

    const frontDoor = await within(wall()).findByRole('link', { name: /Front Door/ });
    expect(frontDoor).toHaveAttribute('href', '/monitors/1');
    expect(within(wall()).getByRole('link', { name: /Driveway/ }))
      .toHaveAttribute('href', '/monitors/2');
    expect(within(wall()).getAllByRole('link')).toHaveLength(2);
  });

  it('keeps the system detail one click away instead of on screen', async () => {
    await renderConsole();

    expect(screen.queryByText('zmc -m 1')).toBeNull();
    const line = await disclose('System detail');

    await waitFor(() => expect(within(line).getByText('v1.37.64')).toBeInTheDocument());
    expect(within(line).getByText('zmc -m 1')).toBeInTheDocument();
    // used / total from the system stats fixture.
    expect(within(line).getByText(/465\.7 GB \/ 931\.3 GB/)).toBeInTheDocument();
  });

  it('lists the newest events in the rail with a total count', async () => {
    await renderConsole();

    expect(await within(rail()).findByRole('link', { name: /Event-101/ }))
      .toHaveAttribute('href', '/events/101');
    expect(within(rail()).getByRole('link', { name: /Event-102/ }))
      .toHaveAttribute('href', '/events/102');
    expect(within(rail()).getByRole('link', { name: /Event-103/ }))
      .toHaveAttribute('href', '/events/103');
    expect(within(rail()).getByText('3')).toBeInTheDocument();
  });

  it('shows the whole fleet rather than the first nine cameras', async () => {
    db.monitors = Array.from({ length: 12 }, (_, i) =>
      makeMonitor({ id: i + 1, name: `Cam ${i + 1}`, sequence: i + 1 }),
    );
    await renderConsole();

    await waitFor(() => expect(within(wall()).getAllByRole('link')).toHaveLength(12));
    const hrefs = within(wall()).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(
      Array.from({ length: 12 }, (_, i) => `/monitors/${i + 1}`),
    );
  });

  it('collapses the rail to give the wall the width', async () => {
    const user = userEvent.setup();
    await renderConsole();

    await user.click(screen.getByRole('button', { name: 'Collapse Recent Events' }));
    expect(rail()).toHaveAttribute('aria-label', 'Recent Events');
    expect(within(rail()).queryByRole('link', { name: /Event-101/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Expand Recent Events' }));
    expect(await within(rail()).findByRole('link', { name: /Event-101/ })).toBeInTheDocument();
  });
});

describe('Console — empty and error states', () => {
  it('says so when no monitors are configured', async () => {
    db.monitors = [];
    await renderConsole();

    expect(await screen.findByText('No monitors configured')).toBeInTheDocument();
  });

  it('says so when the events feed is empty', async () => {
    db.events = [];
    await renderConsole();

    await waitFor(() => expect(within(rail()).getByText('No recent events')).toBeInTheDocument());
  });

  it('surfaces a 500 on the monitor list with a retry', async () => {
    server.use(
      http.get('/api/v3/monitors', () =>
        HttpResponse.json({ error_message: 'boom', code: 500 }, { status: 500 }),
      ),
    );
    await renderConsole();

    expect(await screen.findByText('Cannot reach the server.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument();
  });

  it('refetches the monitor list when Retry is pressed', async () => {
    let calls = 0;
    server.use(
      http.get('/api/v3/monitors', () => {
        calls += 1;
        return HttpResponse.json({ error_message: 'boom', code: 500 }, { status: 500 });
      }),
    );
    const user = userEvent.setup();
    await renderConsole();

    await screen.findByText('Cannot reach the server.');
    const before = calls;
    await user.click(screen.getByRole('button', { name: /Retry/ }));
    await waitFor(() => expect(calls).toBeGreaterThan(before));
  });

  it('falls back to a dash when the backend reports no disk stats', async () => {
    db.systemStatus = makeSystemStatus({ stats: undefined });
    await renderConsole();

    // No stats to report: an em dash where the percentage would be.
    expect(within(await reading('Disk')).getByText('—')).toBeInTheDocument();
  });
});

describe('Console — permissions', () => {
  it('replaces the tile grid with a note when stream access is denied', async () => {
    await renderRoute('/', { perms: { stream: 'None' } });
    expect((await screen.findAllByRole('heading', { name: /^Console$/ })).length)
      .toBeGreaterThan(0);

    await waitFor(() =>
      expect(within(wall()).getByText('You do not have permission to view this.'))
        .toBeInTheDocument(),
    );
    expect(within(wall()).queryByRole('link', { name: /Front Door/ })).not.toBeInTheDocument();
  });

  it('still renders tiles for a view-only stream grant', async () => {
    renderRoute('/', { perms: { stream: 'View' } });
    expect((await screen.findAllByRole('heading', { name: /^Console$/ })).length)
      .toBeGreaterThan(0);

    expect(await within(wall()).findByRole('link', { name: /Front Door/ })).toBeInTheDocument();
  });
});

describe('Console — thumbnail protocol toggle', () => {
  it('starts on WebRTC and switches to HLS then static', async () => {
    const user = userEvent.setup();
    await renderConsole();

    const group = screen.getByRole('group', { name: 'Thumbnail mode' });
    const rtc = within(group).getByRole('button', { name: 'WebRTC live thumbnails' });
    const hls = within(group).getByRole('button', { name: 'HLS live thumbnails' });
    const off = within(group).getByRole('button', { name: 'Static thumbnails (no streaming)' });

    expect(rtc).toHaveAttribute('aria-pressed', 'true');
    expect(hls).toHaveAttribute('aria-pressed', 'false');

    await user.click(hls);
    expect(hls).toHaveAttribute('aria-pressed', 'true');
    expect(rtc).toHaveAttribute('aria-pressed', 'false');

    await user.click(off);
    expect(off).toHaveAttribute('aria-pressed', 'true');
    expect(hls).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('Console — monitor filter bar', () => {
  it('narrows the grid, records the selection and resets', async () => {
    const user = userEvent.setup();
    await renderConsole();

    await within(wall()).findByRole('link', { name: /Front Door/ });

    // The chips live behind the Filters disclosure now.
    await user.click(screen.getByRole('button', { name: /^Filters/ }));

    // Both seeded monitors are capturing, so filtering to "disabled" empties
    // the wall without emptying the underlying list.
    await user.click(screen.getByRole('button', { name: 'Status filter' }));
    await user.click(
      within(screen.getByRole('listbox', { name: 'Status options' }))
        .getByRole('checkbox', { name: 'Disabled' }),
    );

    expect(useMonitorFilterStore.getState().status).toEqual(['disabled']);
    await waitFor(() =>
      expect(screen.getByText('No monitors match the current filter')).toBeInTheDocument(),
    );
    // The readings follow the filter too, and the button counts it.
    expect(within(await reading('Cameras')).getByText('0/2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Filters/ })).toHaveTextContent('1');

    await user.click(screen.getByRole('button', { name: 'Reset all filters' }));
    expect(useMonitorFilterStore.getState().status).toEqual([]);
    expect(await screen.findByRole('link', { name: /Front Door/ })).toBeInTheDocument();
  });

  it('restores a selection persisted from an earlier page', async () => {
    // Console / Montage / Montage Review share the selection through
    // sessionStorage, so arriving with one already set must be honoured.
    useMonitorFilterStore.getState().setMonitorIds([2]);
    const user = userEvent.setup();
    await renderConsole();

    // Applied on first paint, with the bar still closed — the wall reads the
    // filter store, not the bar's callback.
    expect(await within(wall()).findByRole('link', { name: /Driveway/ })).toBeInTheDocument();
    expect(within(wall()).queryByRole('link', { name: /Front Door/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(screen.getByRole('button', { name: 'Monitor filter, 1 selected' })).toBeInTheDocument();
  });
});

describe('Console — live session badges', () => {
  it('marks a monitor with an open live session', async () => {
    server.use(http.get('/api/v3/live/sessions', () => HttpResponse.json([1])));
    const user = userEvent.setup();
    await renderConsole();

    // Static thumbnails is the branch that paints the live mark.
    await user.click(screen.getByRole('button', { name: 'Static thumbnails (no streaming)' }));

    await waitFor(() => expect(within(wall()).getByLabelText('Live')).toBeInTheDocument());
  });

  it('shows the disk stats it is given', async () => {
    db.systemStatus = makeSystemStatus({
      stats: makeSystemStats({ disk_usage_percent: 93, free_disk: 70_000_000_000 }),
    });
    await renderConsole();

    const disk = within(await reading('Disk')).getByText('93%');
    expect(disk).toBeInTheDocument();
    // Past 90%: the reading itself is the message, so it takes the danger tone.
    expect(disk).toHaveClass('text-danger');
  });
});
