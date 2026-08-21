/**
 * Console (`/`) in the modern skin, rendered through the real router.
 *
 * The page is the app's landing screen: four stat cards over a justified
 * grid of live monitor tiles, with a System panel and a recent-events feed
 * down the right. Everything it shows comes from `useConsoleData`'s eight
 * queries, so the tests here drive it end-to-end through MSW rather than
 * stubbing the hook.
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
 * A StatCard exposes no landmark or accessible name, so reach it through
 * its subtitle (unique per card) and walk up to the card body.
 */
function statCard(subtitle: string): HTMLElement {
  return screen.getByText(subtitle).parentElement as HTMLElement;
}

/**
 * A Panel's body, reached from its `<h3>` title. The shell repeats some of
 * these words (the sidebar has a "System" section), so pin the level.
 */
function panel(title: string): HTMLElement {
  const heading = screen.getByRole('heading', { name: title, level: 3 });
  return heading.parentElement!.parentElement!.parentElement as HTMLElement;
}

async function renderConsole() {
  const rendered = renderRoute('/');
  expect((await screen.findAllByRole('heading', { name: /^Console$/ })).length)
    .toBeGreaterThan(0);
  return rendered;
}

describe('Console — renders with data', () => {
  it('summarises the fleet in the four stat cards', async () => {
    await renderConsole();

    // Two seeded monitors, both capturing.
    await waitFor(() => expect(screen.getByText('2 active')).toBeInTheDocument());
    expect(within(statCard('2 active')).getByText('2')).toBeInTheDocument();

    // Three seeded events, all inside the 24h count window.
    expect(within(statCard('events')).getByText('3')).toBeInTheDocument();

    // Only Front Door records (Driveway is recording: 'None').
    expect(within(statCard('cameras')).getByText('1')).toBeInTheDocument();

    // 500 GB of 1 TB used.
    expect(within(statCard('466 GB free')).getByText('50%')).toBeInTheDocument();
  });

  it('renders one tile per monitor, linking into the watch page', async () => {
    await renderConsole();

    const grid = panel('Monitors');
    const frontDoor = await within(grid).findByRole('link', { name: /Front Door/ });
    expect(frontDoor).toHaveAttribute('href', '/monitors/1');
    expect(within(grid).getByRole('link', { name: /Driveway/ }))
      .toHaveAttribute('href', '/monitors/2');
    expect(within(grid).getAllByRole('link')).toHaveLength(2);
  });

  it('shows daemon health and the ZM version in the System panel', async () => {
    await renderConsole();

    const system = panel('System');
    await waitFor(() => expect(within(system).getByText('v1.37.64')).toBeInTheDocument());
    expect(within(system).getByText('Running')).toBeInTheDocument();
    expect(within(system).getByText('zmc -m 1')).toBeInTheDocument();
    // used / total from the system stats fixture.
    expect(within(system).getByText(/465\.7 GB \/ 931\.3 GB/)).toBeInTheDocument();
  });

  it('lists the newest events in the feed with a total count', async () => {
    await renderConsole();

    const feed = panel('Recent Events');
    expect(await within(feed).findByRole('link', { name: /Event-101/ }))
      .toHaveAttribute('href', '/events/101');
    expect(within(feed).getByRole('link', { name: /Event-102/ }))
      .toHaveAttribute('href', '/events/102');
    expect(within(feed).getByRole('link', { name: /Event-103/ }))
      .toHaveAttribute('href', '/events/103');
    expect(within(feed).getByText('3 total')).toBeInTheDocument();
  });

  it('caps the grid at nine tiles and links to the full list', async () => {
    db.monitors = Array.from({ length: 12 }, (_, i) =>
      makeMonitor({ id: i + 1, name: `Cam ${i + 1}`, sequence: i + 1 }),
    );
    await renderConsole();

    const grid = panel('Monitors');
    const overflow = await within(grid).findByRole('link', { name: 'View all 12 monitors →' });
    expect(overflow).toHaveAttribute('href', '/monitors');

    // Nine tiles plus the overflow link — the 10th–12th cameras are not drawn.
    const hrefs = within(grid).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([
      '/monitors/1', '/monitors/2', '/monitors/3', '/monitors/4', '/monitors/5',
      '/monitors/6', '/monitors/7', '/monitors/8', '/monitors/9', '/monitors',
    ]);
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

    const feed = panel('Recent Events');
    await waitFor(() => expect(within(feed).getByText('No recent events')).toBeInTheDocument());
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

    expect(await screen.findByText('disk capacity')).toBeInTheDocument();
    expect(within(statCard('disk capacity')).getByText('—')).toBeInTheDocument();
  });
});

describe('Console — permissions', () => {
  it('replaces the tile grid with a note when stream access is denied', async () => {
    await renderRoute('/', { perms: { stream: 'None' } });
    expect((await screen.findAllByRole('heading', { name: /^Console$/ })).length)
      .toBeGreaterThan(0);

    const grid = panel('Monitors');
    await waitFor(() =>
      expect(within(grid).getByText('You do not have permission to view this.'))
        .toBeInTheDocument(),
    );
    expect(within(grid).queryByRole('link', { name: /Front Door/ })).not.toBeInTheDocument();
  });

  it('still renders tiles for a view-only stream grant', async () => {
    renderRoute('/', { perms: { stream: 'View' } });
    expect((await screen.findAllByRole('heading', { name: /^Console$/ })).length)
      .toBeGreaterThan(0);

    const grid = panel('Monitors');
    expect(await within(grid).findByRole('link', { name: /Front Door/ })).toBeInTheDocument();
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

    const grid = panel('Monitors');
    await within(grid).findByRole('link', { name: /Front Door/ });

    // Both seeded monitors are capturing, so filtering to "disabled" empties
    // the grid without emptying the underlying list.
    await user.click(screen.getByRole('button', { name: 'Status filter' }));
    await user.click(
      within(screen.getByRole('listbox', { name: 'Status options' }))
        .getByRole('checkbox', { name: 'Disabled' }),
    );

    expect(useMonitorFilterStore.getState().status).toEqual(['disabled']);
    await waitFor(() =>
      expect(screen.getByText('No monitors match the current filter')).toBeInTheDocument(),
    );
    // The stat card follows the filter too.
    expect(screen.getByText('0 active')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reset all filters' }));
    expect(useMonitorFilterStore.getState().status).toEqual([]);
    expect(await screen.findByRole('link', { name: /Front Door/ })).toBeInTheDocument();
  });

  it('restores a selection persisted from an earlier page', async () => {
    // Console / Montage / Montage Review share the selection through
    // sessionStorage, so arriving with one already set must be honoured.
    useMonitorFilterStore.getState().setMonitorIds([2]);
    await renderConsole();

    const grid = panel('Monitors');
    expect(await within(grid).findByRole('link', { name: /Driveway/ })).toBeInTheDocument();
    expect(within(grid).queryByRole('link', { name: /Front Door/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Monitor filter, 1 selected' })).toBeInTheDocument();
  });
});

describe('Console — live session badges', () => {
  it('marks a monitor with an open live session', async () => {
    server.use(http.get('/api/v3/live/sessions', () => HttpResponse.json([1])));
    const user = userEvent.setup();
    await renderConsole();

    // Static thumbnails is the branch that paints the LIVE badge.
    await user.click(screen.getByRole('button', { name: 'Static thumbnails (no streaming)' }));

    const grid = panel('Monitors');
    await waitFor(() => expect(within(grid).getByText('LIVE')).toBeInTheDocument());
  });

  it('shows the disk stats it is given', async () => {
    db.systemStatus = makeSystemStatus({
      stats: makeSystemStats({ disk_usage_percent: 93, free_disk: 70_000_000_000 }),
    });
    await renderConsole();

    expect(await screen.findByText('65.2 GB free')).toBeInTheDocument();
    expect(within(statCard('65.2 GB free')).getByText('93%')).toBeInTheDocument();
  });
});
