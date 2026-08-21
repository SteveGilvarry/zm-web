/**
 * Cycle (`/cycle`) in the modern skin, through the real router.
 *
 * The page rotates one monitor at a time across a stage: `CycleLayout`
 * owns the chrome (filter bar, view-mode switch, transport, interval dial,
 * quick-jump chips) and `cycle.tsx` decides what goes on stage — a live
 * WebRTC cell in Stream mode, a refreshing snapshot in Stills.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { renderRoute } from '@/test/renderRoute';
import { db, server, setupMockServer } from '@/test/msw/server';
import { makeMonitor } from '@/test/fixtures';
import { useMonitorFilterStore } from '@/stores/monitorFilter';

setupMockServer();

beforeEach(() => {
  // The filter bar is shared with Console / Montage through sessionStorage.
  useMonitorFilterStore.getState().reset();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

async function renderCycle(path = '/cycle', options?: Parameters<typeof renderRoute>[1]) {
  const rendered = renderRoute(path, options);
  expect((await screen.findAllByRole('heading', { name: /^Cycle$/ })).length)
    .toBeGreaterThan(0);
  return rendered;
}

/** The monitor currently on stage, from the layout's `<h2>`. */
async function onStage(): Promise<string> {
  const heading = await waitFor(() => {
    const h = document.querySelector('main h2');
    if (!h) throw new Error('nothing on stage yet');
    return h;
  });
  return heading.textContent ?? '';
}

/** The quick-jump chip strip. */
function jumpNav(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Monitors' });
}

/** The live countdown readout — a `<span>`, unlike the interval `<button>`s. */
function countdown(): string | undefined {
  return screen
    .queryAllByText(/^\d+s$/)
    .find((el) => el.tagName === 'SPAN')?.textContent ?? undefined;
}

describe('Cycle — renders with data', () => {
  it('puts the first capturing monitor on stage with its position', async () => {
    await renderCycle();

    expect(await onStage()).toBe('Front Door');
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Monitor settings/ }))
      .toHaveAttribute('href', '/monitors/1');
  });

  it('offers a quick-jump chip per monitor and marks the current one', async () => {
    await renderCycle();
    await onStage();

    const nav = jumpNav();
    const chips = within(nav).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual(['Front Door', 'Driveway']);
    expect(chips[0]).toHaveAttribute('aria-current', 'true');
    expect(chips[1]).not.toHaveAttribute('aria-current');
  });

  it('leaves non-capturing monitors out of the rotation', async () => {
    db.monitors = [
      makeMonitor({ id: 1, name: 'Front Door' }),
      makeMonitor({ id: 2, name: 'Shed', capturing: 'None' }),
      makeMonitor({ id: 3, name: 'Lane' }),
    ];
    await renderCycle();
    await onStage();

    const chips = within(jumpNav()).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual(['Front Door', 'Lane']);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('starts a live stream on stage in Stream mode', async () => {
    await renderCycle();
    await onStage();

    const modes = screen.getByRole('group', { name: 'View mode' });
    expect(within(modes).getByRole('button', { name: 'Stream' }))
      .toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('main video')).not.toBeNull();
  });
});

describe('Cycle — transport', () => {
  it('steps forward, wraps around and steps back', async () => {
    const user = userEvent.setup();
    await renderCycle();
    await onStage();

    const controls = screen.getByRole('group', { name: 'Cycle controls' });
    await user.click(within(controls).getByRole('button', { name: 'Next monitor' }));
    expect(await onStage()).toBe('Driveway');
    expect(screen.getByText('2 / 2')).toBeInTheDocument();

    // Past the end wraps to the start.
    await user.click(within(controls).getByRole('button', { name: 'Next monitor' }));
    expect(await onStage()).toBe('Front Door');

    // And backwards off the start wraps to the end.
    await user.click(within(controls).getByRole('button', { name: 'Previous monitor' }));
    expect(await onStage()).toBe('Driveway');
  });

  it('jumps straight to a monitor from its chip', async () => {
    const user = userEvent.setup();
    await renderCycle();
    await onStage();

    await user.click(within(jumpNav()).getByRole('button', { name: 'Driveway' }));

    expect(await onStage()).toBe('Driveway');
    expect(within(jumpNav()).getByRole('button', { name: 'Driveway' }))
      .toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('link', { name: /Monitor settings/ }))
      .toHaveAttribute('href', '/monitors/2');
  });

  it('pauses and resumes, hiding the countdown while paused', async () => {
    const user = userEvent.setup();
    await renderCycle();
    await onStage();

    const controls = screen.getByRole('group', { name: 'Cycle controls' });
    expect(countdown()).toBe('10s');

    const pause = within(controls).getByRole('button', { name: 'Pause cycling' });
    expect(pause).toHaveAttribute('aria-pressed', 'false');
    await user.click(pause);

    const resume = within(controls).getByRole('button', { name: 'Resume cycling' });
    expect(resume).toHaveAttribute('aria-pressed', 'true');
    expect(countdown()).toBeUndefined();

    await user.click(resume);
    expect(within(controls).getByRole('button', { name: 'Pause cycling' })).toBeInTheDocument();
    expect(countdown()).toBe('10s');
  });

  it('changes the dwell interval and resets the countdown with it', async () => {
    const user = userEvent.setup();
    await renderCycle();
    await onStage();

    const dial = screen.getByRole('group', { name: 'Interval' });
    expect(within(dial).getByRole('button', { name: '10 seconds' }))
      .toHaveAttribute('aria-pressed', 'true');

    await user.click(within(dial).getByRole('button', { name: '30 seconds' }));

    expect(within(dial).getByRole('button', { name: '30 seconds' }))
      .toHaveAttribute('aria-pressed', 'true');
    expect(within(dial).getByRole('button', { name: '10 seconds' }))
      .toHaveAttribute('aria-pressed', 'false');
    expect(countdown()).toBe('30s');
  });

  it('drops the countdown when only one monitor is in rotation', async () => {
    db.monitors = [makeMonitor({ id: 1, name: 'Front Door' })];
    await renderCycle();
    await onStage();

    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    expect(countdown()).toBeUndefined();
  });
});

describe('Cycle — view mode', () => {
  it('swaps the live cell for a snapshot in Stills mode and back', async () => {
    const user = userEvent.setup();
    await renderCycle();
    await onStage();

    const modes = screen.getByRole('group', { name: 'View mode' });
    await user.click(within(modes).getByRole('button', { name: 'Stills' }));

    expect(within(modes).getByRole('button', { name: 'Stills' }))
      .toHaveAttribute('aria-pressed', 'true');
    expect(within(modes).getByRole('button', { name: 'Stream' }))
      .toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(document.querySelector('main video')).toBeNull());

    await user.click(within(modes).getByRole('button', { name: 'Stream' }));
    await waitFor(() => expect(document.querySelector('main video')).not.toBeNull());
  });
});

describe('Cycle — search params', () => {
  it('starts on the monitor named by ?monitor_id', async () => {
    const { router } = await renderCycle('/cycle?monitor_id=2');

    expect(await onStage()).toBe('Driveway');
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ monitor_id: 2 });
  });

  it('releases the requested monitor once the operator steps away', async () => {
    const user = userEvent.setup();
    await renderCycle('/cycle?monitor_id=2');
    expect(await onStage()).toBe('Driveway');

    const controls = screen.getByRole('group', { name: 'Cycle controls' });
    await user.click(within(controls).getByRole('button', { name: 'Next monitor' }));
    expect(await onStage()).toBe('Front Door');
  });

  it('ignores a monitor_id that is not a positive integer', async () => {
    const { router } = await renderCycle('/cycle?monitor_id=nope');

    expect(await onStage()).toBe('Front Door');
    expect(router.state.location.search).toEqual({});
  });

  it('ignores a monitor_id that names no monitor in rotation', async () => {
    await renderCycle('/cycle?monitor_id=999');
    expect(await onStage()).toBe('Front Door');
  });
});

describe('Cycle — empty, error and permission states', () => {
  it('says so when nothing is capturing', async () => {
    db.monitors = [makeMonitor({ id: 1, name: 'Shed', capturing: 'None' })];
    await renderCycle();

    expect(await screen.findByText('No capturing monitors to cycle through.'))
      .toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Cycle controls' })).not.toBeInTheDocument();
  });

  it('says so when there are no monitors at all', async () => {
    db.monitors = [];
    await renderCycle();

    expect(await screen.findByText('No capturing monitors to cycle through.'))
      .toBeInTheDocument();
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
    await renderCycle();

    expect(await screen.findByText('Cannot reach the server.')).toBeInTheDocument();
    const before = calls;
    await user.click(screen.getByRole('button', { name: /Retry/ }));
    await waitFor(() => expect(calls).toBeGreaterThan(before));
  });

  it('withholds the stage from an operator without stream access', async () => {
    await renderCycle('/cycle', { perms: { stream: 'None' } });

    expect(await onStage()).toBe('Front Door');
    expect(await screen.findByText('You do not have permission to view this.'))
      .toBeInTheDocument();
    expect(document.querySelector('main video')).toBeNull();
    // The transport still renders — it is the video that is withheld.
    expect(screen.getByRole('group', { name: 'Cycle controls' })).toBeInTheDocument();
  });
});

describe('Cycle — monitor filter bar', () => {
  it('narrows the rotation to the filtered monitors', async () => {
    const user = userEvent.setup();
    await renderCycle();
    await onStage();

    await user.click(screen.getByRole('button', { name: 'Monitor filter' }));
    await user.click(
      within(screen.getByRole('listbox', { name: 'Monitor options' }))
        .getByRole('checkbox', { name: 'Driveway' }),
    );

    await waitFor(() => expect(screen.getByText('1 / 1')).toBeInTheDocument());
    expect(await onStage()).toBe('Driveway');
    expect(within(jumpNav()).getAllByRole('button').map((b) => b.textContent))
      .toEqual(['Driveway']);
  });

  it('empties the stage when the filter matches nothing', async () => {
    const user = userEvent.setup();
    await renderCycle();
    await onStage();

    await user.click(screen.getByRole('button', { name: 'Status filter' }));
    await user.click(
      within(screen.getByRole('listbox', { name: 'Status options' }))
        .getByRole('checkbox', { name: 'Disabled' }),
    );

    expect(await screen.findByText('No capturing monitors to cycle through.'))
      .toBeInTheDocument();
  });
});
