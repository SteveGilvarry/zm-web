/**
 * Legacy `?view=stats` and `?view=frame` in the classic skin, through the
 * real router.
 */
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';

import { renderRoute } from '@/test/renderRoute';
import { setupMockServer, server, db } from '@/test/msw/server';
import { makeEvent, makeFrame, makeZone, paginated } from '@/test/fixtures';

setupMockServer();

const stat = {
  id: 9, monitor_id: 1, zone_id: 3, event_id: 101, frame_id: 2,
  pixel_diff: 25, alarm_pixels: 15360, filter_pixels: 10000, blob_pixels: 9999, blobs: 2,
  min_blob_size: 1000, max_blob_size: 8000, min_x: 12, max_x: 300, min_y: 34, max_y: 400, score: 88,
};

/** Records the `frame_id` of every `/stats` request. */
function seed(stats = [stat]) {
  db.events = [makeEvent({ id: 101, monitor_id: 1, name: 'Event-101', width: 640, height: 480, frames: 4 })];
  db.frames = [
    makeFrame({ event_id: 101, frame_id: 1, delta: '0.00' }),
    makeFrame({ event_id: 101, frame_id: 2, type: 'Alarm', score: 88, delta: '1.50' }),
    makeFrame({ event_id: 101, frame_id: 3, score: 22, delta: '2.25' }),
    makeFrame({ event_id: 101, frame_id: 4, score: 88, delta: '3.00' }),
  ];
  db.zones = [makeZone({ id: 3, monitor_id: 1, name: 'Driveway', area: 5000, coords: '0,0 50,0 50,100 0,100' })];
  const asked: Array<string | null> = [];
  server.use(http.get('/api/v3/stats', ({ request }) => {
    asked.push(new URL(request.url).searchParams.get('frame_id'));
    return HttpResponse.json(paginated(stats));
  }));
  return asked;
}

describe('stats page — classic', () => {
  it('reproduces getStatsTableHTML for the frame in ?fid=', async () => {
    const asked = seed();
    renderRoute('/events/101/stats?fid=2', { skin: 'classic' });

    const table = await screen.findByTestId('stats-table');
    expect(within(table).getByText('Stats - 101 - 2')).toBeInTheDocument();
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Zone', 'Pixel Diff', 'Alarm Px', 'Filter Px', 'Blob Px', 'Blobs', 'Blob Sizes', 'Alarm Limits', 'Score',
    ]);
    const row = await within(table).findByTestId('stats-row-3');
    expect([...row.querySelectorAll('td')].map((td) => td.textContent)).toEqual([
      'Driveway', '25', '15360 (10%)', '10000 (6%)', '9999 (6%)', '2', '1000-8000 (0%-5%)', '12,34-300,400', '88',
    ]);
    expect(asked).toContain('2');
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
  });

  it('says so when the frame has no stats', async () => {
    seed([]);
    renderRoute('/events/101/stats?fid=3', { skin: 'classic' });
    expect(
      await screen.findByText('There are no statistics recorded for this event/frame'),
    ).toBeInTheDocument();
  });

  it('opens the max-score frame without a ?fid=', async () => {
    const asked = seed();
    renderRoute('/events/101/stats', { skin: 'classic' });
    expect(await screen.findByText('Stats - 101 - 2')).toBeInTheDocument();
    await waitFor(() => expect(asked).toContain('2'));
  });
});

describe('frame viewer — classic', () => {
  it('shows the frame, its stats and the four links of frame.php', async () => {
    seed();
    renderRoute('/events/101/frames/2', { skin: 'classic' });

    const title = await screen.findByTestId('frame-title');
    await waitFor(() => expect(title.textContent).toBe('Frame 101-2 (88)'));
    expect(screen.getByTestId('frame-image')).toHaveAttribute('src', expect.stringMatching(/^\/api\/v3\/events\/101\/frames\/2\/image/));

    const stats = await screen.findByTestId('frame-stats-table');
    // One decimal on the shares, as ajax/stats.php's raw rows print them.
    expect(within(stats).getByText('10000 (6.5%)')).toBeInTheDocument();
    expect(within(stats).getByRole('link', { name: '101' })).toHaveAttribute('href', '/events/101');

    expect(screen.getByRole('link', { name: 'First' })).toHaveAttribute('href', '/events/101/frames/1');
    expect(screen.getByRole('link', { name: 'Prev' })).toHaveAttribute('href', '/events/101/frames/1');
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute('href', '/events/101/frames/3');
    expect(screen.getByRole('link', { name: 'Last' })).toHaveAttribute('href', '/events/101/frames/4');
    expect(screen.getByRole('link', { name: 'Stats View' })).toHaveAttribute('href', '/events/101/stats?fid=2');
    expect(screen.getByRole('link', { name: 'Frames' })).toHaveAttribute('href', '/events/101/frames');
  });

  it('greys First and Prev on frame 1, and Next and Last on the last frame', async () => {
    seed();
    const { unmount } = renderRoute('/events/101/frames/1', { skin: 'classic' });
    await screen.findByTestId('frame-image');
    expect(screen.queryByRole('link', { name: 'First' })).not.toBeInTheDocument();
    expect(screen.getByText('First')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('link', { name: 'Next' })).toBeInTheDocument();
    unmount();

    renderRoute('/events/101/frames/4', { skin: 'classic' });
    await screen.findByTestId('frame-image');
    expect(screen.getByText('Last')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('link', { name: 'Prev' })).toHaveAttribute('href', '/events/101/frames/3');
  });

  it('resolves frame 0 to the max-score frame and hides the stats on the Stats button', async () => {
    seed();
    const user = userEvent.setup();
    renderRoute('/events/101/frames/0', { skin: 'classic' });
    const title = await screen.findByTestId('frame-title');
    // Frames 2 and 4 share the top score; legacy's query returns the first.
    await waitFor(() => expect(title.textContent).toBe('Frame 101-2 (88)'));

    await screen.findByTestId('frame-stats-table');
    await user.click(screen.getByRole('button', { name: 'Stats' }));
    expect(screen.queryByTestId('frame-stats-table')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stats' }));
    expect(screen.getByTestId('frame-stats-table')).toBeInTheDocument();
  });
});
