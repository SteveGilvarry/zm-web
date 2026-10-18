import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders as render } from '@/test/render';
import type { ZmEvent } from '@/types';

// A plain anchor stands in for the router Link, so the table renders without
// a router.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={to ?? '#'} {...rest}>
      {children}
    </a>
  ),
}));

const { EventsTable } = await import('./EventsTable');
const { useEventsColumnsStore, EVENTS_COLUMNS } = await import('@/stores/eventsColumns');

beforeEach(() => {
  useEventsColumnsStore.getState().resetDefaults();
});

function makeEvent(over: Partial<ZmEvent> = {}): ZmEvent {
  return {
    id: 1,
    monitor_id: 7,
    storage_id: 2,
    name: 'Event-0001',
    cause: 'Motion',
    start_date_time: '2026-06-01T12:00:00Z',
    end_date_time: '2026-06-01T12:00:12Z',
    width: 1920,
    height: 1080,
    length: 12,
    frames: 100,
    alarm_frames: 12,
    default_video: '',
    tot_score: 200,
    avg_score: 17,
    max_score: 42,
    archived: 1,
    videoed: 0,
    uploaded: 0,
    emailed: 0,
    messaged: 0,
    executed: 0,
    notes: null,
    state_id: 1,
    orientation: 'ROTATE_0',
    disk_space: 2048,
    scheme: 'Deep',
    locked: 0,
    tags: [{ id: 3, name: 'Delivery' }, { id: 4, name: 'Night' }],
    ...over,
  } as ZmEvent;
}

function renderTable(onSort = vi.fn()) {
  render(
    <EventsTable
      events={[makeEvent()]}
      monitorName={() => 'Front door'}
      storageName={(id) => (id === 2 ? 'Archive disk' : String(id))}
      token={undefined}
      selectedIds={new Set()}
      onToggleSelected={() => {}}
      onToggleAll={() => {}}
      showThumbnail={false}
      sortField="start_time"
      sortDir="desc"
      onSort={onSort}
    />,
  );
  return onSort;
}

/** Header text, in order, minus the checkbox and actions columns. */
function headers(): string[] {
  return screen.getAllByRole('columnheader')
    .map((th) => th.textContent?.replace(/[▲▼]/g, '').trim() ?? '')
    .filter((text) => text !== '' && text !== 'Actions');
}

describe('modern EventsTable', () => {
  it('renders the default column set from the store, in the store order', () => {
    renderTable();
    expect(headers()).toEqual([
      'Id', 'Name', 'Archived', 'Monitor', 'Cause', 'Tags', 'Start', 'End', 'Duration',
      'Frames', 'Alarm', 'Total score', 'Avg score', 'Max score', 'Storage', 'Disk space',
    ]);
    // Emailed is hidden on first run, as in legacy.
    expect(headers()).not.toContain('Emailed');
  });

  it('renders the cells the old fixed table had no room for', () => {
    renderTable();
    const row = within(screen.getAllByRole('row')[1]);
    expect(row.getByText('Delivery, Night')).toBeInTheDocument();
    expect(row.getByText('Archive disk')).toBeInTheDocument();
    expect(row.getByText('2.0 KB')).toBeInTheDocument();
    expect(row.getByText('200')).toBeInTheDocument();
    expect(row.getByText('17')).toBeInTheDocument();
    expect(row.getByText('Yes')).toBeInTheDocument();
  });

  it('follows the column chooser: hiding, showing and showing all', () => {
    renderTable();
    act(() => useEventsColumnsStore.getState().toggle('cause'));
    expect(headers()).not.toContain('Cause');
    act(() => useEventsColumnsStore.getState().toggle('emailed'));
    expect(headers()).toContain('Emailed');
    // Emailed slots in where the store puts it: after Archived.
    expect(headers().indexOf('Emailed')).toBe(headers().indexOf('Archived') + 1);
    act(() => useEventsColumnsStore.getState().showAll());
    expect(headers()).toHaveLength(EVENTS_COLUMNS.length);
  });

  it('sorts by the archived, emailed and disk space headers', async () => {
    const user = userEvent.setup();
    act(() => useEventsColumnsStore.getState().showAll());
    const onSort = renderTable();
    await user.click(screen.getByRole('button', { name: 'Sort by Archived' }));
    await user.click(screen.getByRole('button', { name: 'Sort by Emailed' }));
    await user.click(screen.getByRole('button', { name: 'Sort by Disk space' }));
    expect(onSort.mock.calls.map((c) => c[0])).toEqual(['archived', 'emailed', 'disk_space']);
    // Tags and Storage have no backend sort field, so their headers are text.
    expect(screen.queryByRole('button', { name: 'Sort by Tags' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sort by Storage' })).toBeNull();
  });
});
