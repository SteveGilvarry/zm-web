import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { Monitor } from '@/types';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={to ?? '#'} {...rest}>{children}</a>
  ),
}));
const { ConsoleClassicTable } = await import('./ConsoleClassicTable');

const m = (id: number, name: string, host?: string): Monitor =>
  ({
    id, name, host: host ?? null,
    width: 1920, height: 1080,
    orientation: 'Rotate0',
    capturing: 'Always', analysing: 'None', recording: 'None',
  } as unknown as Monitor);

const summary = (
  monitor_id: number,
  hour = 0, day = 0, week = 0, month = 0, total = 0, archived = 0,
) => ({
  monitor_id,
  hour_events: hour,    hour_event_disk_space: hour * 1024,
  day_events: day,      day_event_disk_space: day * 1024,
  week_events: week,    week_event_disk_space: week * 1024,
  month_events: month,  month_event_disk_space: month * 1024,
  total_events: total,  total_event_disk_space: total * 1024,
  archived_events: archived, archived_event_disk_space: archived * 1024,
});

const data = {
  monitors: [m(2, 'Driveway East'), m(1, 'Front Door'), m(3, 'Garage')],
  summariesByMonitor: [
    summary(1, 4, 87, 612, 2000, 5000, 25),
    summary(3, 0, 12),
  ],
} as unknown as Parameters<typeof ConsoleClassicTable>[0]['data'];

describe('ConsoleClassicTable — rendering', () => {
  it('shows a row per monitor with name + counts', () => {
    renderWithProviders(<ConsoleClassicTable data={data} />);
    expect(screen.getByText('Driveway East')).toBeInTheDocument();
    expect(screen.getByText('Front Door')).toBeInTheDocument();
    expect(screen.getByText('Garage')).toBeInTheDocument();

    // Front Door's row should carry its hour/day/week counts.
    const row = screen.getByText('Front Door').closest('tr');
    expect(row).toBeTruthy();
    expect(within(row!).getByText('4')).toBeInTheDocument();
    expect(within(row!).getByText('87')).toBeInTheDocument();
    expect(within(row!).getByText('612')).toBeInTheDocument();
  });

  it('shows 0 for monitors that have no count entry in a bucket', () => {
    renderWithProviders(<ConsoleClassicTable data={data} />);
    const row = screen.getByText('Driveway East').closest('tr');
    // Driveway has zero counts everywhere — every numeric cell renders '0'.
    expect(within(row!).getAllByText('0').length).toBeGreaterThan(0);
  });
});

describe('ConsoleClassicTable — sort', () => {
  it('initial sort is by Sequence ascending; missing sequence sinks to the bottom', () => {
    // Override fixture: give Front Door + Garage explicit sequence values
    // so the new default sort orders them; Driveway East has no sequence
    // and should land last (Number.MAX_SAFE_INTEGER tiebreaker).
    const seqData = {
      ...data,
      monitors: data.monitors.map((m) =>
        m.name === 'Front Door' ? { ...m, sequence: 1 } :
        m.name === 'Garage'     ? { ...m, sequence: 2 } : m,
      ),
    } as typeof data;
    renderWithProviders(<ConsoleClassicTable data={seqData} />);
    const rows = screen
      .getAllByRole('row')
      .filter((r) => r.parentElement?.tagName === 'TBODY');
    const names = rows.map((r) => within(r).getByRole('link').textContent?.trim());
    expect(names).toEqual(['Front Door', 'Garage', 'Driveway East']);
  });

  it('clicking the Name header re-sorts alphabetically', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsoleClassicTable data={data} />);

    await user.click(screen.getByText(/^name$/i));
    // Filter to tbody rows only — header + footer are excluded so the test
    // doesn't care that we added a totals row.
    const rows = screen
      .getAllByRole('row')
      .filter((r) => r.parentElement?.tagName === 'TBODY');
    const names = rows.map((r) => within(r).getByRole('link').textContent?.trim());
    expect(names).toEqual(['Driveway East', 'Front Door', 'Garage']);
  });

  it('clicking the same header toggles to descending', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsoleClassicTable data={data} />);
    await user.click(screen.getByText(/^name$/i));
    await user.click(screen.getByText(/^name$/i));
    // Filter to tbody rows only — header + footer are excluded so the test
    // doesn't care that we added a totals row.
    const rows = screen
      .getAllByRole('row')
      .filter((r) => r.parentElement?.tagName === 'TBODY');
    const names = rows.map((r) => within(r).getByRole('link').textContent?.trim());
    expect(names).toEqual(['Garage', 'Front Door', 'Driveway East']);
  });
});

describe('ConsoleClassicTable — runtime status', () => {
  const withRuntime = {
    ...data,
    runtimeById: {
      1: { monitorId: 1, status: 'Connected', captureFps: 10.89, analysisFps: 0, bandwidth: 1427762, updatedOn: '' },
      2: { monitorId: 2, status: 'NotRunning', captureFps: 0, analysisFps: 0, bandwidth: 0, updatedOn: '' },
    },
  } as unknown as Parameters<typeof ConsoleClassicTable>[0]['data'];

  it('paints the lens from the capture-process state and shows fps + bandwidth in the Function cell', () => {
    renderWithProviders(<ConsoleClassicTable data={withRuntime} />);
    expect(screen.getByLabelText('Connected').className).toContain('bg-emerald-500');
    expect(screen.getByLabelText('NotRunning').className).toContain('bg-red-500');
    expect(screen.getByTestId('console-runtime-1')).toHaveTextContent('Connected · 10.9 fps / 0.0 fps · 1.4 MB/s');
    expect(screen.queryByTestId('console-runtime-3')).toBeNull(); // no row yet
  });

  it('shows the legacy status breakdown pills and footer totals', () => {
    renderWithProviders(<ConsoleClassicTable data={withRuntime} />);
    const pills = screen.getByTestId('console-status-pills');
    expect(pills).toHaveTextContent('Capturing 1 (33%)');
    expect(pills).toHaveTextContent('Not Running 1 (33%)');
    expect(pills).toHaveTextContent('Unknown 1 (33%)');
    expect(screen.getByTestId('console-runtime-totals')).toHaveTextContent('1.4 MB/s · 10.9 fps / 0.0 fps');
  });

  it('renders no pills or totals before the status poll has answered', () => {
    renderWithProviders(<ConsoleClassicTable data={data} />);
    expect(screen.queryByTestId('console-status-pills')).toBeNull();
    expect(screen.queryByTestId('console-runtime-totals')).toBeNull();
  });
});
