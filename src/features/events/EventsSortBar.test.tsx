import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { EVENT_SORT_FIELDS } from '@/api/events';
import { EventsSortBar } from './EventsSortBar';
import { COLUMN_SORT_FIELD } from './sortColumns';

/**
 * The sort bar is what the card view has instead of sortable column headers,
 * so it has to say the same things a header does: which field is active,
 * which way it is sorted, and what a click will do.
 */
describe('EventsSortBar', () => {
  it('offers a button for every backend sort field', () => {
    renderWithProviders(<EventsSortBar sortField="start_time" sortDir="desc" onToggle={() => {}} />);
    const group = screen.getByRole('group', { name: 'Sort events' });
    expect(within(group).getAllByRole('button')).toHaveLength(EVENT_SORT_FIELDS.length);
  });

  it('announces the active field and its direction', () => {
    const { rerender } = renderWithProviders(
      <EventsSortBar sortField="max_score" sortDir="desc" onToggle={() => {}} />,
    );
    const active = screen.getByRole('button', { name: 'Max score, sorted descending' });
    expect(active).toHaveAttribute('aria-pressed', 'true');
    // Everything else offers to sort rather than reporting a state.
    expect(screen.getByRole('button', { name: 'Sort by Start' }))
      .toHaveAttribute('aria-pressed', 'false');

    rerender(<EventsSortBar sortField="max_score" sortDir="asc" onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: 'Max score, sorted ascending' }))
      .toHaveAttribute('aria-pressed', 'true');
  });

  it('reports the field that was clicked, active or not', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<EventsSortBar sortField="start_time" sortDir="desc" onToggle={onToggle} />);

    await user.click(screen.getByRole('button', { name: 'Sort by Cause' }));
    expect(onToggle).toHaveBeenCalledWith('cause');

    // Clicking the active field is how the direction flips, so it reports too.
    await user.click(screen.getByRole('button', { name: 'Start, sorted descending' }));
    expect(onToggle).toHaveBeenLastCalledWith('start_time');
  });
});

describe('COLUMN_SORT_FIELD', () => {
  it('maps a column to a field the API actually accepts', () => {
    for (const field of Object.values(COLUMN_SORT_FIELD)) {
      expect(EVENT_SORT_FIELDS).toContain(field);
    }
  });

  it('leaves the columns the backend cannot sort by unmapped', () => {
    // zm-api has no sort for these, so their headers stay inert rather than
    // silently sorting by something else.
    for (const key of ['tags', 'storage', 'disk_space', 'archived', 'emailed'] as const) {
      expect(COLUMN_SORT_FIELD[key]).toBeUndefined();
    }
  });

  it('sorts the Monitor column by id, which is what the API offers', () => {
    expect(COLUMN_SORT_FIELD.monitor).toBe('monitor_id');
  });
});
