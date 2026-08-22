import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders as render } from '@/test/render';
import userEvent from '@testing-library/user-event';
import type { ZmEvent } from '@/types';

// Replace the router Link with a plain anchor so the table renders without
// a Router context. The QueryClientProvider comes from `renderWithProviders`
// — the table reads ZoneMinder's date/time settings through `useZmConfig`.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={to ?? '#'} {...rest}>
      {children}
    </a>
  ),
}));

const { ClassicEventsTable } = await import('./ClassicEventsTable');
const { useEventsColumnsStore } = await import('@/stores/eventsColumns');

// Reset column-visibility to defaults before each test so suite ordering
// can't leak hidden/shown column choices across cases.
beforeEach(() => {
  useEventsColumnsStore.getState().resetDefaults();
});

function makeEvent(over: Partial<ZmEvent> = {}): ZmEvent {
  return {
    id: 1,
    monitor_id: 7,
    storage_id: 1,
    name: 'Event-0001',
    cause: 'Motion',
    start_date_time: '2026-06-01T12:00:00Z',
    end_date_time: null,
    width: 1920,
    height: 1080,
    length: 12,
    frames: 100,
    alarm_frames: 12,
    default_video: '',
    tot_score: 200,
    avg_score: 12,
    max_score: 42,
    archived: 0,
    videoed: 0,
    uploaded: 0,
    emailed: 0,
    messaged: 0,
    executed: 0,
    notes: null,
    state_id: 1,
    orientation: 'Rotate0',
    disk_space: 0,
    scheme: 'Deep',
    locked: 0,
    tags: null,
    ...over,
  } as ZmEvent;
}

const noopMonitorLookup = { 7: 'Front Door', 8: 'Driveway' };

describe('ClassicEventsTable — empty state', () => {
  it('shows the "no events match" hint when the events list is empty', () => {
    render(
      <ClassicEventsTable
        events={[]}
        monitorLookup={noopMonitorLookup}
        selectedIds={new Set()}
        onToggleSelected={() => {}}
      />,
    );
    expect(screen.getByText(/no events match the current filters/i)).toBeInTheDocument();
  });
});

describe('ClassicEventsTable — header', () => {
  it('renders the column headers operators expect', () => {
    render(
      <ClassicEventsTable
        events={[makeEvent()]}
        monitorLookup={noopMonitorLookup}
        selectedIds={new Set()}
        onToggleSelected={() => {}}
      />,
    );
    const header = screen.getAllByRole('rowgroup')[0]; // <thead>
    const headerScope = within(header);
    // Legacy column order after the checkbox column.
    const labels = within(header).getAllByRole('columnheader').map((th) => th.textContent?.replace(/[▲▼⇵]/g, '').trim());
    expect(labels.slice(1)).toEqual([
      'Id', 'Name', 'Archived', 'Monitor', 'Cause', 'Tags', 'Start Time', 'End Time', 'Duration',
      'Frames', 'Alarm Frames', 'Total Score', 'Avg. Score', 'Max. Score', 'Storage', 'DiskSpace',
    ]);
    expect(headerScope.queryByText('Emailed')).toBeNull();
  });

  it('makes Name / Cause / Monitor / Frames sortable now the backend can order by them', async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    render(
      <ClassicEventsTable
        events={[makeEvent()]}
        monitorLookup={noopMonitorLookup}
        selectedIds={new Set()}
        onToggleSelected={() => {}}
        sortField="cause"
        sortDir="desc"
        onSort={onSort}
      />,
    );
    for (const [label, field] of [
      ['Name', 'name'], ['Cause', 'cause'], ['Monitor', 'monitor_id'], ['Frames', 'frames'],
    ] as const) {
      await user.click(screen.getByRole('button', { name: new RegExp(`^${label}`) }));
      expect(onSort).toHaveBeenLastCalledWith(field);
    }
    // The active column carries the direction for assistive tech.
    const cause = screen.getByRole('button', { name: /^Cause/ }).closest('th')!;
    expect(cause).toHaveAttribute('aria-sort', 'descending');
    // Tags and DiskSpace still have no backend column, so they stay inert.
    expect(screen.queryByRole('button', { name: /^Tags/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^DiskSpace/ })).toBeNull();
  });

  it('links Frames / Alarm Frames / Max Score cells to the frames view', () => {
    render(
      <ClassicEventsTable
        events={[makeEvent({ id: 5, frames: 321, alarm_frames: 17, max_score: 99 })]}
        monitorLookup={noopMonitorLookup}
        selectedIds={new Set()}
        onToggleSelected={() => {}}
      />,
    );
    for (const text of ['321', '17', '99']) {
      expect(screen.getByRole('link', { name: text }).getAttribute('href')).toBe('/events/$eventId/frames');
    }
    expect(screen.getByRole('link', { name: 'Event-0001' }).getAttribute('href')).toBe('/events/$eventId');
  });

  it('shows the storage name and HH:MM:SS duration with a totals footer', () => {
    render(
      <ClassicEventsTable
        events={[makeEvent({ id: 1, length: 65, disk_space: 2048, storage_id: 0 }), makeEvent({ id: 2, length: 5, disk_space: 1024, storage_id: 3 })]}
        monitorLookup={noopMonitorLookup}
        storageName={(id) => (id === 0 ? 'Default' : `Store ${id}`)}
        selectedIds={new Set()}
        onToggleSelected={() => {}}
      />,
    );
    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.getByText('Store 3')).toBeInTheDocument();
    expect(screen.getByText('00:01:05')).toBeInTheDocument();
    expect(screen.getByTestId('events-total-duration').textContent).toBe('00:01:10');
    expect(screen.getByTestId('events-total-disk-space').textContent).toBe('3.0 KB');
  });
});

describe('ClassicEventsTable — rows', () => {
  it('renders one row per event with monitor name + cause + tot/avg/max', () => {
    render(
      <ClassicEventsTable
        events={[
          makeEvent({ id: 1, monitor_id: 7, tot_score: 200, avg_score: 12, max_score: 42 }),
          makeEvent({ id: 2, monitor_id: 8, name: 'Event-0002', cause: 'Alarm', tot_score: 555, avg_score: 33, max_score: 77 }),
        ]}
        monitorLookup={noopMonitorLookup}
        selectedIds={new Set()}
        onToggleSelected={() => {}}
      />,
    );
    expect(screen.getByText('Front Door')).toBeInTheDocument();
    expect(screen.getByText('Driveway')).toBeInTheDocument();
    // Each event row links via its id
    expect(screen.getByRole('link', { name: '1' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '2' })).toBeInTheDocument();
    // Unique scores from row 2
    expect(screen.getByText('555')).toBeInTheDocument();
    expect(screen.getByText('77')).toBeInTheDocument();
  });

  it('falls back to "Monitor {id}" when the monitor lookup is missing the entry', () => {
    render(
      <ClassicEventsTable
        events={[makeEvent({ id: 1, monitor_id: 99 })]}
        monitorLookup={{}}
        selectedIds={new Set()}
        onToggleSelected={() => {}}
      />,
    );
    expect(screen.getByText('Monitor 99')).toBeInTheDocument();
  });
});

describe('ClassicEventsTable — selection', () => {
  it('marks the row checkbox as checked when its id is in selectedIds', () => {
    render(
      <ClassicEventsTable
        events={[makeEvent({ id: 1 })]}
        monitorLookup={noopMonitorLookup}
        selectedIds={new Set([1])}
        onToggleSelected={() => {}}
      />,
    );
    const rowCheckbox = screen.getByRole('checkbox', { name: /select event 1/i }) as HTMLInputElement;
    expect(rowCheckbox.checked).toBe(true);
  });

  it('calls onToggleSelected with the event id when a row checkbox is clicked', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <ClassicEventsTable
        events={[makeEvent({ id: 1 }), makeEvent({ id: 2 })]}
        monitorLookup={noopMonitorLookup}
        selectedIds={new Set()}
        onToggleSelected={onToggle}
      />,
    );
    await user.click(screen.getByRole('checkbox', { name: /select event 2/i }));
    expect(onToggle).toHaveBeenCalledWith(2);
  });

  it('Select-all toggles every row id when none are selected', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <ClassicEventsTable
        events={[makeEvent({ id: 1 }), makeEvent({ id: 2 }), makeEvent({ id: 3 })]}
        monitorLookup={noopMonitorLookup}
        selectedIds={new Set()}
        onToggleSelected={onToggle}
      />,
    );
    await user.click(screen.getByRole('checkbox', { name: /select all events/i }));
    expect(onToggle).toHaveBeenCalledTimes(3);
    expect(onToggle.mock.calls.map((c) => c[0]).sort()).toEqual([1, 2, 3]);
  });

  it('Select-all is checked when every row is selected', () => {
    render(
      <ClassicEventsTable
        events={[makeEvent({ id: 1 }), makeEvent({ id: 2 })]}
        monitorLookup={noopMonitorLookup}
        selectedIds={new Set([1, 2])}
        onToggleSelected={() => {}}
      />,
    );
    const all = screen.getByRole('checkbox', { name: /select all events/i }) as HTMLInputElement;
    expect(all.checked).toBe(true);
  });
});

describe('ClassicEventsTable — archived / emailed', () => {
  it('renders Yes/No like legacy and shows Emailed once the column is on', () => {
    useEventsColumnsStore.getState().toggle('emailed');
    render(
      <ClassicEventsTable
        events={[makeEvent({ id: 1, archived: 1, emailed: 0 })]}
        monitorLookup={noopMonitorLookup}
        selectedIds={new Set()}
        onToggleSelected={() => {}}
      />,
    );
    expect(screen.getByText('Emailed')).toBeInTheDocument();
    const row = screen.getAllByRole('row')[1];
    const cells = within(row).getAllByRole('cell').map((td) => td.textContent);
    expect(cells.slice(1, 5)).toEqual(['1', 'Event-0001', 'Yes', 'No']);
  });
});
