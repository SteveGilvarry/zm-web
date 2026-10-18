/**
 * The stats page and the frame viewer in the modern skin, through the real
 * router.
 */
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { renderRoute } from '@/test/renderRoute';
import { setupMockServer, server, db } from '@/test/msw/server';
import { makeEvent, makeFrame, makeZone, paginated } from '@/test/fixtures';

setupMockServer();

const stat = {
  id: 9, monitor_id: 1, zone_id: 3, event_id: 101, frame_id: 2,
  pixel_diff: 25, alarm_pixels: 15360, filter_pixels: 10000, blob_pixels: 9999, blobs: 2,
  min_blob_size: 1000, max_blob_size: 8000, min_x: 12, max_x: 300, min_y: 34, max_y: 400, score: 88,
};

function seed() {
  db.events = [makeEvent({ id: 101, monitor_id: 1, name: 'Event-101', width: 640, height: 480, frames: 3 })];
  db.frames = [
    makeFrame({ id: 11, event_id: 101, frame_id: 1, delta: '0.00' }),
    makeFrame({ id: 12, event_id: 101, frame_id: 2, type: 'Alarm', score: 88, delta: '1.50' }),
    makeFrame({ id: 13, event_id: 101, frame_id: 3, score: 22, delta: '2.25' }),
  ];
  db.zones = [makeZone({ id: 3, monitor_id: 1, name: 'Driveway', area: 5000, coords: '0,0 50,0 50,100 0,100' })];
  server.use(http.get('/api/v3/stats', () => HttpResponse.json(paginated([stat]))));
}

describe('stats page — modern', () => {
  it('lists the frame\'s zones with their shares and links to the frame', async () => {
    seed();
    renderRoute('/events/101/stats?fid=2');
    const row = await screen.findByTestId('stats-row-3');
    expect([...row.querySelectorAll('td')].map((td) => td.textContent)).toEqual([
      'Driveway', '25', '15360 (10%)', '10000 (6%)', '9999 (6%)', '2', '1000-8000 (0%-5%)', '12,34-300,400', '88',
    ]);
    expect(screen.getByRole('link', { name: /View frame/ })).toHaveAttribute('href', '/events/101/frames/2');
  });
});

describe('frame viewer — modern', () => {
  it('steps through the event\'s frames', async () => {
    seed();
    const user = userEvent.setup();
    const { router } = renderRoute('/events/101/frames/2');
    expect(await screen.findByTestId('frame-image')).toHaveAttribute('src', expect.stringMatching(/frames\/12\/image/));
    expect(screen.getByTestId('frame-score')).toHaveTextContent('score 88');
    expect(within(await screen.findByTestId('frame-stats-table')).getByText('10000 (6.5%)')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/events/101/frames/3'));
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Last' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'First' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/events/101/frames/1'));
    expect(screen.getByRole('button', { name: 'Prev' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Stats View' })).toHaveAttribute('href', '/events/101/stats?fid=1');
  });
});
