import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ZmEvent } from '@/types';

// Replace the router Link with a plain anchor so the table renders without
// a Router context.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={to ?? '#'} {...rest}>
      {children}
    </a>
  ),
}));

const { ClassicEventsTable } = await import('./ClassicEventsTable');

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
    ['ID', 'Monitor', 'Name', 'Cause', 'Time', 'Duration', 'Frames', 'Alarm', 'Tot', 'Avg', 'Max', 'Tags']
      .forEach((label) => expect(headerScope.getByText(label)).toBeInTheDocument());
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
    // Each event row links via "#{id}"
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
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

describe('ClassicEventsTable — archived events', () => {
  it('renders the "Arch" badge for archived events', () => {
    render(
      <ClassicEventsTable
        events={[makeEvent({ id: 1, archived: 1 })]}
        monitorLookup={noopMonitorLookup}
        selectedIds={new Set()}
        onToggleSelected={() => {}}
      />,
    );
    expect(screen.getByText('Arch')).toBeInTheDocument();
  });
});
