import { describe, expect, it, beforeEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from '@/test/render';
import { server, setupMockServer } from '@/test/msw/server';
import { useMonitorFilterStore } from '@/stores/monitorFilter';
import {
  MonitorFilterBar,
  filterMonitors,
  type MonitorFilterSelections,
} from './MonitorFilterBar';
import { useAuthStore } from '@/stores/auth';
import type { Monitor } from '@/types';

setupMockServer();

/* -------------------------------------------------------------------------- */
/*  Test fixtures                                                             */
/* -------------------------------------------------------------------------- */

function mk(
  id: number,
  name: string,
  overrides: Partial<Monitor> = {},
): Monitor {
  return {
    id,
    name,
    type: 'Ffmpeg',
    capturing: 'Always',
    analysing: 'Always',
    recording: 'OnMotion',
    enabled: 1,
    ...overrides,
  } as unknown as Monitor;
}

const MONS: Monitor[] = [
  mk(1, 'Front Door',  { capturing: 'Always',   analysing: 'Always', recording: 'OnMotion', type: 'Ffmpeg' }),
  mk(2, 'Driveway',    { capturing: 'Always',   analysing: 'None',   recording: 'None',     type: 'Libvlc' }),
  mk(3, 'Garage',      { capturing: 'Ondemand', analysing: 'Always', recording: 'Always',   type: 'Ffmpeg' }),
  mk(4, 'Back Yard',   { capturing: 'None',     analysing: 'None',   recording: 'None',     type: 'Local'  }),
];

const EMPTY_SEL: MonitorFilterSelections = {
  groupIds: [], capturing: [], analysing: [], recording: [], status: [], source: [], monitorIds: [],
};

const NO_GROUPS = new Map<number, Set<number>>();

/* -------------------------------------------------------------------------- */
/*  Pure filter logic                                                         */
/* -------------------------------------------------------------------------- */

describe('filterMonitors — pure logic', () => {
  it('passes every monitor when no chip is set', () => {
    expect(filterMonitors(MONS, EMPTY_SEL, NO_GROUPS)).toEqual(MONS);
  });

  it('multi-select within a chip OR-combines (capturing: Always OR Ondemand)', () => {
    const out = filterMonitors(
      MONS,
      { ...EMPTY_SEL, capturing: ['Always', 'Ondemand'] },
      NO_GROUPS,
    );
    // Excludes monitor #4 which has capturing=None.
    expect(out.map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it('different chips AND-combine (Capturing: Always AND Source: Ffmpeg)', () => {
    const out = filterMonitors(
      MONS,
      { ...EMPTY_SEL, capturing: ['Always'], source: ['Ffmpeg'] },
      NO_GROUPS,
    );
    // Only #1: Front Door (Always + Ffmpeg). #3 is Ondemand, #2 is Libvlc.
    expect(out.map((m) => m.id)).toEqual([1]);
  });

  it('status=active filters out capturing=None monitors', () => {
    const out = filterMonitors(
      MONS,
      { ...EMPTY_SEL, status: ['active'] },
      NO_GROUPS,
    );
    expect(out.map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it('status=disabled keeps only capturing=None monitors', () => {
    const out = filterMonitors(
      MONS,
      { ...EMPTY_SEL, status: ['disabled'] },
      NO_GROUPS,
    );
    expect(out.map((m) => m.id)).toEqual([4]);
  });

  it('groupIds narrows to the union of selected groups', () => {
    const groups = new Map<number, Set<number>>([
      [10, new Set([1, 2])],
      [20, new Set([3])],
    ]);
    const out = filterMonitors(
      MONS,
      { ...EMPTY_SEL, groupIds: [10] },
      groups,
    );
    expect(out.map((m) => m.id)).toEqual([1, 2]);

    const both = filterMonitors(
      MONS,
      { ...EMPTY_SEL, groupIds: [10, 20] },
      groups,
    );
    expect(both.map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it('monitorIds gate restricts to exact ids', () => {
    const out = filterMonitors(
      MONS,
      { ...EMPTY_SEL, monitorIds: [2, 4] },
      NO_GROUPS,
    );
    expect(out.map((m) => m.id)).toEqual([2, 4]);
  });
});

/* -------------------------------------------------------------------------- */
/*  Component tests                                                           */
/* -------------------------------------------------------------------------- */

describe('MonitorFilterBar — component', () => {
  beforeEach(() => {
    // Fresh store between tests so chip state doesn't leak.
    useMonitorFilterStore.getState().reset();
    sessionStorage.clear();
    // Pretend we have an authenticated user so the groups query runs.
    useAuthStore.setState({
      accessToken: 't',
      refreshToken: 'r',
      user: { iat: 0, exp: Math.floor(Date.now() / 1000) + 3600, user: 'admin' },
      isAuthenticated: true,
    });
    // Stub groups endpoints to a known shape.
    server.use(
      http.get('/api/v3/groups', () => HttpResponse.json({
        items: [
          { id: 10, name: 'Outdoor' },
          { id: 20, name: 'Indoor'  },
        ],
        total: 2, per_page: 200, current_page: 1, last_page: 1,
      })),
      http.get('/api/v3/groups-monitors', () => HttpResponse.json({
        items: [
          { id: 1, group_id: 10, monitor_id: 1 },
          { id: 2, group_id: 10, monitor_id: 2 },
          { id: 3, group_id: 20, monitor_id: 3 },
        ],
        total: 3, per_page: 1000, current_page: 1, last_page: 1,
      })),
    );
  });

  it('renders all seven chip groups', async () => {
    renderWithProviders(
      <MonitorFilterBar monitors={MONS} onChange={() => {}} />,
    );
    expect(screen.getByRole('button', { name: /groups filter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /capturing filter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /analysing filter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recording filter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /status filter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /source filter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /monitor filter/i })).toBeInTheDocument();
  });

  it('selecting a Capturing option narrows the filtered set', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(m: Monitor[]) => void>();
    renderWithProviders(
      <MonitorFilterBar monitors={MONS} onChange={onChange} />,
    );

    // Initial fire: everything passes.
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    onChange.mockClear();

    await user.click(screen.getByRole('button', { name: /capturing filter/i }));
    const list = await screen.findByRole('listbox', { name: /capturing options/i });
    await user.click(within(list).getByLabelText('None'));

    await waitFor(() => {
      const lastCall = onChange.mock.calls.at(-1);
      expect(lastCall).toBeDefined();
      expect((lastCall![0] as Monitor[]).map((m) => m.id)).toEqual([4]);
    });
  });

  it('multi-select inside a chip OR-combines values', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(m: Monitor[]) => void>();
    renderWithProviders(
      <MonitorFilterBar monitors={MONS} onChange={onChange} />,
    );
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    onChange.mockClear();

    await user.click(screen.getByRole('button', { name: /capturing filter/i }));
    const list = await screen.findByRole('listbox', { name: /capturing options/i });
    await user.click(within(list).getByLabelText('Always'));
    await user.click(within(list).getByLabelText('Ondemand'));

    await waitFor(() => {
      const last = onChange.mock.calls.at(-1)![0] as Monitor[];
      // monitors 1, 2 (Always) and 3 (Ondemand) — not 4 (None).
      expect(last.map((m) => m.id).sort()).toEqual([1, 2, 3]);
    });
  });

  it('different chips AND-combine (Capturing AND Source)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(m: Monitor[]) => void>();
    renderWithProviders(
      <MonitorFilterBar monitors={MONS} onChange={onChange} />,
    );
    await waitFor(() => expect(onChange).toHaveBeenCalled());

    // Capturing: Always
    await user.click(screen.getByRole('button', { name: /capturing filter/i }));
    await user.click(
      within(await screen.findByRole('listbox', { name: /capturing options/i }))
        .getByLabelText('Always'),
    );
    // Click outside to close before opening Source.
    await user.click(document.body);

    // Source: Ffmpeg
    await user.click(screen.getByRole('button', { name: /source filter/i }));
    await user.click(
      within(await screen.findByRole('listbox', { name: /source options/i }))
        .getByLabelText('Ffmpeg'),
    );

    await waitFor(() => {
      const last = onChange.mock.calls.at(-1)![0] as Monitor[];
      // Only monitor #1 (Front Door: Always + Ffmpeg).
      expect(last.map((m) => m.id)).toEqual([1]);
    });
  });

  it('shows an active count badge when ≥1 option is selected', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <MonitorFilterBar monitors={MONS} onChange={() => {}} />,
    );

    const capturingBtn = screen.getByRole('button', { name: /capturing filter/i });
    await user.click(capturingBtn);
    await user.click(
      within(await screen.findByRole('listbox', { name: /capturing options/i }))
        .getByLabelText('Always'),
    );

    // The chip button now exposes a "1 active" aria label on the count badge.
    await waitFor(() => {
      expect(screen.getByLabelText('1 active')).toHaveTextContent('1');
    });
  });

  it('Reset button clears all selections', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(m: Monitor[]) => void>();
    renderWithProviders(
      <MonitorFilterBar monitors={MONS} onChange={onChange} />,
    );

    // Apply a capturing filter first.
    await user.click(screen.getByRole('button', { name: /capturing filter/i }));
    await user.click(
      within(await screen.findByRole('listbox', { name: /capturing options/i }))
        .getByLabelText('Always'),
    );

    // Reset button appears once anything is selected.
    const resetBtn = await screen.findByRole('button', { name: /reset all filters/i });
    onChange.mockClear();
    await user.click(resetBtn);

    await waitFor(() => {
      const last = onChange.mock.calls.at(-1)![0] as Monitor[];
      // Everything is back.
      expect(last.map((m) => m.id).sort()).toEqual([1, 2, 3, 4]);
    });
    // And the Reset button disappears.
    expect(screen.queryByRole('button', { name: /reset all filters/i })).toBeNull();
  });

  it('Group chip narrows monitors via the groups-monitors association', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(m: Monitor[]) => void>();
    renderWithProviders(
      <MonitorFilterBar monitors={MONS} onChange={onChange} />,
    );

    // Wait for the groups + memberships queries to settle so the dropdown
    // has its options.
    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });

    await user.click(screen.getByRole('button', { name: /groups filter/i }));
    const list = await screen.findByRole('listbox', { name: /groups options/i });
    // "Outdoor" has monitors 1 + 2.
    await user.click(within(list).getByLabelText('Outdoor'));

    await waitFor(() => {
      const last = onChange.mock.calls.at(-1)![0] as Monitor[];
      expect(last.map((m) => m.id).sort()).toEqual([1, 2]);
    });
  });

  it('selections persist via the Zustand store across remounts', async () => {
    const user = userEvent.setup();
    const onChange1 = vi.fn<(m: Monitor[]) => void>();
    const { unmount } = renderWithProviders(
      <MonitorFilterBar monitors={MONS} onChange={onChange1} />,
    );
    await user.click(screen.getByRole('button', { name: /capturing filter/i }));
    await user.click(
      within(await screen.findByRole('listbox', { name: /capturing options/i }))
        .getByLabelText('Always'),
    );
    await waitFor(() => expect(useMonitorFilterStore.getState().capturing).toEqual(['Always']));

    unmount();

    // Remount — selection should still be applied.
    const onChange2 = vi.fn<(m: Monitor[]) => void>();
    renderWithProviders(
      <MonitorFilterBar monitors={MONS} onChange={onChange2} />,
    );
    await waitFor(() => {
      const last = onChange2.mock.calls.at(-1)![0] as Monitor[];
      // Filter still applied: only monitors with capturing=Always.
      expect(last.map((m) => m.id).sort()).toEqual([1, 2]);
    });
  });
});
