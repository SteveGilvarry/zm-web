import { describe, expect, it, beforeEach } from 'vitest';
import { useEventsColumnsStore, EVENTS_COLUMNS } from './eventsColumns';

describe('eventsColumns store', () => {
  beforeEach(() => {
    // Each test starts from the shipped defaults so suite ordering can't
    // leak hidden columns.
    useEventsColumnsStore.getState().resetDefaults();
  });

  it('starts with the off-by-default columns hidden', () => {
    const hidden = useEventsColumnsStore.getState().hidden;
    const expected = EVENTS_COLUMNS
      .filter((c) => !c.defaultVisible)
      .map((c) => c.key)
      .sort();
    expect([...hidden].sort()).toEqual(expected);
  });

  it('toggle flips a default-visible column off and back on', () => {
    const { toggle, isVisible } = useEventsColumnsStore.getState();
    expect(isVisible('cause')).toBe(true);
    toggle('cause');
    expect(useEventsColumnsStore.getState().isVisible('cause')).toBe(false);
    useEventsColumnsStore.getState().toggle('cause');
    expect(useEventsColumnsStore.getState().isVisible('cause')).toBe(true);
  });

  it('showAll clears every hidden column', () => {
    useEventsColumnsStore.getState().toggle('frames');
    useEventsColumnsStore.getState().toggle('tags');
    useEventsColumnsStore.getState().showAll();
    expect(useEventsColumnsStore.getState().hidden).toEqual([]);
  });

  it('resetDefaults restores the shipped defaults', () => {
    useEventsColumnsStore.getState().showAll();
    useEventsColumnsStore.getState().resetDefaults();
    const hidden = useEventsColumnsStore.getState().hidden;
    // Only Emailed ships hidden (legacy default column set).
    expect(hidden).toEqual(['emailed']);
  });
});
