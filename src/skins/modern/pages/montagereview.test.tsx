/**
 * Route-level tests for the modern-skin Montage Review page
 * (`/montagereview`).
 *
 * The page is a clock, a monitor selection and a grid of recorded-event
 * players, so the deterministic parts are the ones asserted here: the legacy
 * `?monitor_id=&min_time=&max_time=` deep link, the range maths behind
 * pan/zoom, the transport controls, and which of `stream` / `events` the
 * permission gate asks for.
 *
 * jsdom has no media pipeline — `play`/`pause` on HTMLMediaElement raise
 * "not implemented" — so those two are stubbed here rather than in the shared
 * setup, which no other page needs.
 */
import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import i18next from 'i18next';

import { renderRoute } from '@/test/renderRoute';
import { setupMockServer, server, db } from '@/test/msw/server';
import { makeEvent } from '@/test/fixtures';
import { useMonitorFilterStore } from '@/stores/monitorFilter';

setupMockServer();

beforeAll(() => {
  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(async () => {});
  vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  useMonitorFilterStore.getState().reset();
});

/** The page's own range formatter, so assertions don't hard-code a locale. */
const fmt = (d: Date) =>
  d.toLocaleString(i18next.language, { dateStyle: 'short', timeStyle: 'short' });

/** A legacy-style deep link with a wide, timezone-proof custom window. */
const WIDE_RANGE = '?min_time=2026-08-01%2000%3A00%3A00&max_time=2026-09-01%2000%3A00%3A00';
const WIDE_START = new Date('2026-08-01T00:00:00');
const WIDE_END = new Date('2026-09-01T00:00:00');

/** The chip row paints empty until `/monitors` answers — wait for a chip. */
async function findChips(): Promise<HTMLElement> {
  const chips = await screen.findByRole('group', { name: 'Monitors' });
  await within(chips).findByRole('button', { name: 'Front Door' });
  return chips;
}

function rangeGroup(): HTMLElement {
  return screen.getByRole('group', { name: 'Range' });
}

describe('MontageReviewPage (modern) — rendering', () => {
  it('selects every capturing monitor and draws a track each', async () => {
    renderRoute('/montagereview');

    const chips = await findChips();
    for (const name of ['Front Door', 'Driveway']) {
      await waitFor(() => {
        expect(within(chips).getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
      });
    }

    // Grid cell overlay + timeline track per monitor, on top of the chip.
    await waitFor(() => expect(screen.getAllByText('Front Door').length).toBeGreaterThan(1));
    expect(screen.getByText('Timeline')).toBeInTheDocument();
    // Nothing recorded under the playhead at the start of the window.
    expect(screen.getAllByText('No Event')).toHaveLength(2);
  });

  it('opens on the last 24 hours', async () => {
    renderRoute('/montagereview');
    await findChips();

    expect(within(rangeGroup()).getByRole('button', { name: '24 hours' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('asks for monitors when every chip is switched off', async () => {
    const user = userEvent.setup();
    renderRoute('/montagereview');
    const chips = await findChips();

    await user.click(within(chips).getByRole('button', { name: 'Front Door' }));
    await user.click(within(chips).getByRole('button', { name: 'Driveway' }));

    expect(
      await screen.findByText('Select one or more monitors to review.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Timeline')).not.toBeInTheDocument();
  });

  it('shows the empty state with no monitors on the box', async () => {
    db.monitors = [];
    renderRoute('/montagereview');

    expect(
      await screen.findByText('Select one or more monitors to review.'),
    ).toBeInTheDocument();
  });

  it('shows the error state when the monitors query 500s, and retries', async () => {
    let calls = 0;
    server.use(
      http.get('/api/v3/monitors', () => {
        calls += 1;
        if (calls === 1) {
          return HttpResponse.json({ error_message: 'boom', code: 500 }, { status: 500 });
        }
        return HttpResponse.json({
          items: db.monitors,
          total: db.monitors.length,
          per_page: 100,
          current_page: 1,
          last_page: 1,
        });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/montagereview');

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Cannot reach the server.')).toBeInTheDocument();

    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    const chips = await findChips();
    expect(within(chips).getByRole('button', { name: 'Driveway' })).toBeInTheDocument();
  });
});

describe('MontageReviewPage (modern) — permissions', () => {
  it('gates recorded review on the events permission', async () => {
    renderRoute('/montagereview', { perms: { events: 'None' } });

    expect(
      await screen.findByText('You do not have permission to view this.'),
    ).toBeInTheDocument();
    // The chips and the timeline are outside the gate; the players are not.
    expect(screen.queryByText('No Event')).not.toBeInTheDocument();
  });

  it('gates the Live preset on the stream permission instead', async () => {
    const user = userEvent.setup();
    renderRoute('/montagereview', { perms: { stream: 'None' } });
    await findChips();
    // Recorded review is still allowed…
    expect(screen.queryByText('You do not have permission to view this.')).not.toBeInTheDocument();

    await user.click(within(rangeGroup()).getByRole('button', { name: 'Live' }));

    expect(
      await screen.findByText('You do not have permission to view this.'),
    ).toBeInTheDocument();
  });
});

describe('MontageReviewPage (modern) — legacy deep link', () => {
  it('preselects ?monitor_id= and opens the ?min_time/?max_time window', async () => {
    renderRoute(`/montagereview${WIDE_RANGE}&monitor_id=2`);

    const chips = await findChips();
    expect(within(chips).getByRole('button', { name: 'Driveway' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(chips).getByRole('button', { name: 'Front Door' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    // A URL range means no preset owns the window.
    for (const preset of ['1 hour', '8 hours', '24 hours', 'All events', 'Live']) {
      expect(within(rangeGroup()).getByRole('button', { name: preset })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    }
    expect(screen.getByText(`${fmt(WIDE_START)} – ${fmt(WIDE_END)}`)).toBeInTheDocument();
  });

  it('keeps the search params on the URL', async () => {
    const { router } = renderRoute('/montagereview?monitor_id=2&min_time=2026-08-01%2000%3A00%3A00&max_time=2026-09-01%2000%3A00%3A00');
    await findChips();

    expect(router.state.location.search).toEqual({
      monitor_id: 2,
      min_time: '2026-08-01 00:00:00',
      max_time: '2026-09-01 00:00:00',
    });
  });

  it('ignores an unparsable range and falls back to 24 hours', async () => {
    renderRoute('/montagereview?min_time=not-a-date&max_time=also-not');
    await findChips();

    expect(within(rangeGroup()).getByRole('button', { name: '24 hours' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('draws an event bar per recorded event inside the window', async () => {
    renderRoute(`/montagereview${WIDE_RANGE}&monitor_id=1`);
    await findChips();

    expect(
      await screen.findByTitle('Event-101 — 2026-08-21T09:00:00Z'),
    ).toBeInTheDocument();
    expect(screen.getByTitle('Event-103 — 2026-08-21T09:00:00Z')).toBeInTheDocument();
    // Monitor 2's event is not on this track.
    expect(screen.queryByTitle(/Event-102/)).not.toBeInTheDocument();
  });

  it('plays the event spanning the playhead and links out to it', async () => {
    db.events = [
      makeEvent({
        id: 501,
        monitor_id: 1,
        name: 'Event-501',
        start_date_time: '2020-01-01T00:00:00Z',
        end_date_time: '2030-01-01T00:00:00Z',
      }),
    ];
    renderRoute(`/montagereview${WIDE_RANGE}&monitor_id=1`);
    await findChips();

    const link = await screen.findByRole('link', { name: '#501' });
    expect(link).toHaveAttribute('href', '/events/501');
    expect(screen.getByTitle("Download this event's video")).toHaveAttribute(
      'href',
      expect.stringContaining('/events/501/video'),
    );
    expect(screen.queryByText('No Event')).not.toBeInTheDocument();
  });
});

describe('MontageReviewPage (modern) — range controls', () => {
  it('switches to a preset window', async () => {
    const user = userEvent.setup();
    renderRoute(`/montagereview${WIDE_RANGE}`);
    await findChips();

    await user.click(within(rangeGroup()).getByRole('button', { name: '1 hour' }));

    await waitFor(() => {
      expect(within(rangeGroup()).getByRole('button', { name: '1 hour' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
    expect(screen.queryByText(`${fmt(WIDE_START)} – ${fmt(WIDE_END)}`)).not.toBeInTheDocument();
  });

  it('halves the window on zoom in, around the playhead', async () => {
    const user = userEvent.setup();
    renderRoute(`/montagereview${WIDE_RANGE}`);
    await findChips();

    await user.click(screen.getByRole('button', { name: 'Zoom in' }));

    // Playhead sits at the range start, so zooming in keeps the start and
    // pulls the end halfway back.
    const halved = new Date(
      WIDE_START.getTime() + (WIDE_END.getTime() - WIDE_START.getTime()) / 2,
    );
    expect(
      await screen.findByText(`${fmt(WIDE_START)} – ${fmt(halved)}`),
    ).toBeInTheDocument();
  });

  it('doubles the window on zoom out', async () => {
    const user = userEvent.setup();
    renderRoute(`/montagereview${WIDE_RANGE}`);
    await findChips();

    await user.click(screen.getByRole('button', { name: 'Zoom out' }));

    const doubled = new Date(
      WIDE_START.getTime() + (WIDE_END.getTime() - WIDE_START.getTime()) * 2,
    );
    expect(
      await screen.findByText(`${fmt(WIDE_START)} – ${fmt(doubled)}`),
    ).toBeInTheDocument();
  });

  it('slides the window on pan', async () => {
    const user = userEvent.setup();
    renderRoute(`/montagereview${WIDE_RANGE}`);
    await findChips();

    const span = WIDE_END.getTime() - WIDE_START.getTime();
    await user.click(screen.getByRole('button', { name: 'Pan later' }));
    expect(
      await screen.findByText(
        `${fmt(new Date(WIDE_START.getTime() + span / 2))} – ${fmt(new Date(WIDE_END.getTime() + span / 2))}`,
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Pan earlier' }));
    expect(
      await screen.findByText(`${fmt(WIDE_START)} – ${fmt(WIDE_END)}`),
    ).toBeInTheDocument();
  });

  it('drops the range and transport controls in Live mode', async () => {
    const user = userEvent.setup();
    renderRoute('/montagereview');
    await findChips();

    await user.click(within(rangeGroup()).getByRole('button', { name: 'Live' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Zoom in' })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument();
    expect(screen.queryByText('Timeline')).not.toBeInTheDocument();
    expect(within(rangeGroup()).getByRole('button', { name: 'Live' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Leaving Live brings the recorded review back.
    await user.click(within(rangeGroup()).getByRole('button', { name: '8 hours' }));
    expect(await screen.findByText('Timeline')).toBeInTheDocument();
  });
});

describe('MontageReviewPage (modern) — transport', () => {
  it('toggles play and pause', async () => {
    const user = userEvent.setup();
    renderRoute(`/montagereview${WIDE_RANGE}`);
    await findChips();

    const play = screen.getByRole('button', { name: 'Play' });
    expect(play).toHaveAttribute('aria-pressed', 'false');

    await user.click(play);
    const pause = await screen.findByRole('button', { name: 'Pause' });
    expect(pause).toHaveAttribute('aria-pressed', 'true');

    await user.click(pause);
    expect(await screen.findByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('picks a playback speed', async () => {
    const user = userEvent.setup();
    renderRoute(`/montagereview${WIDE_RANGE}`);
    await findChips();

    const speeds = screen.getByRole('group', { name: 'Speed' });
    expect(within(speeds).getByRole('button', { name: '1× speed' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(within(speeds).getByRole('button', { name: '4× speed' }));

    await waitFor(() => {
      expect(within(speeds).getByRole('button', { name: '4× speed' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });
    expect(within(speeds).getByRole('button', { name: '1× speed' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

describe('MontageReviewPage (modern) — monitor selection', () => {
  it('drops a monitor from the grid and the timeline when its chip is off', async () => {
    const user = userEvent.setup();
    renderRoute(`/montagereview${WIDE_RANGE}`);
    const chips = await findChips();
    await waitFor(() => expect(screen.getAllByText('No Event')).toHaveLength(2));

    await user.click(within(chips).getByRole('button', { name: 'Driveway' }));

    await waitFor(() => expect(screen.getAllByText('No Event')).toHaveLength(1));
    expect(within(chips).getByRole('button', { name: 'Driveway' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    // Only the chip is left mentioning it — no cell, no track.
    expect(screen.getAllByText('Driveway')).toHaveLength(1);
  });

  it('honours the shared monitor filter bar', async () => {
    useMonitorFilterStore.getState().setMonitorIds([1]);
    renderRoute('/montagereview');

    const chips = await findChips();
    await waitFor(() => {
      expect(within(chips).queryByRole('button', { name: 'Driveway' })).not.toBeInTheDocument();
    });
    expect(within(chips).getByRole('button', { name: 'Front Door' })).toBeInTheDocument();
  });
});
