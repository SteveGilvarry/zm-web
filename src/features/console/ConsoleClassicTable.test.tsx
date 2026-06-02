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

const data = {
  monitors: [m(2, 'Driveway East'), m(1, 'Front Door'), m(3, 'Garage')],
  countsByMonitor: {
    hour:  [{ monitor_id: 1, count: 4 }],
    day:   [{ monitor_id: 1, count: 87 }, { monitor_id: 3, count: 12 }],
    week:  [{ monitor_id: 1, count: 612 }],
    month: [],
  },
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
  it('initial sort is by ID ascending', () => {
    renderWithProviders(<ConsoleClassicTable data={data} />);
    const rows = screen.getAllByRole('row');
    // rows[0] is the header; data rows follow.
    const names = rows.slice(1).map((r) => within(r).getByRole('link').textContent?.trim());
    expect(names).toEqual(['Front Door', 'Driveway East', 'Garage']);
  });

  it('clicking the Name header re-sorts alphabetically', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsoleClassicTable data={data} />);

    await user.click(screen.getByText(/^name$/i));
    const rows = screen.getAllByRole('row');
    const names = rows.slice(1).map((r) => within(r).getByRole('link').textContent?.trim());
    expect(names).toEqual(['Driveway East', 'Front Door', 'Garage']);
  });

  it('clicking the same header toggles to descending', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsoleClassicTable data={data} />);
    await user.click(screen.getByText(/^name$/i));
    await user.click(screen.getByText(/^name$/i));
    const rows = screen.getAllByRole('row');
    const names = rows.slice(1).map((r) => within(r).getByRole('link').textContent?.trim());
    expect(names).toEqual(['Garage', 'Front Door', 'Driveway East']);
  });
});
