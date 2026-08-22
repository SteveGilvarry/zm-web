/**
 * The console column-visibility store (legacy's `zmConsoleTable` cookie) and
 * the header label map.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import {
  CONSOLE_COLUMNS, DEFAULT_HIDDEN, consoleColumnLabel, useConsoleColumnsStore,
} from './consoleColumns';

/** The setup file loads i18n with no catalogue, so `t(key) === key`. */
const t = ((key: string) => key) as unknown as TFunction;

beforeEach(() => { useConsoleColumnsStore.getState().reset(); });
afterEach(() => {
  useConsoleColumnsStore.getState().reset();
  localStorage.removeItem('zm-console-columns');
});

describe('useConsoleColumnsStore', () => {
  it('starts with the legacy default-hidden set and everything else visible', () => {
    const { isVisible } = useConsoleColumnsStore.getState();
    for (const key of DEFAULT_HIDDEN) expect(isVisible(key), key).toBe(false);
    for (const key of CONSOLE_COLUMNS) {
      if (DEFAULT_HIDDEN.includes(key)) continue;
      expect(isVisible(key), key).toBe(true);
    }
  });

  it('toggle hides a visible column and shows a hidden one', () => {
    const { toggle } = useConsoleColumnsStore.getState();

    toggle('thumbnail');
    expect(useConsoleColumnsStore.getState().isVisible('thumbnail')).toBe(false);
    expect(useConsoleColumnsStore.getState().hidden).toContain('thumbnail');

    toggle('thumbnail');
    expect(useConsoleColumnsStore.getState().isVisible('thumbnail')).toBe(true);
    expect(useConsoleColumnsStore.getState().hidden).not.toContain('thumbnail');

    // A default-hidden column toggles the other way first.
    toggle('manufacturer');
    expect(useConsoleColumnsStore.getState().isVisible('manufacturer')).toBe(true);
  });

  it('reset restores the defaults after arbitrary edits', () => {
    const { toggle } = useConsoleColumnsStore.getState();
    toggle('id');
    toggle('name');
    toggle('sequence');
    expect(useConsoleColumnsStore.getState().hidden).not.toEqual([...DEFAULT_HIDDEN]);

    useConsoleColumnsStore.getState().reset();
    expect(useConsoleColumnsStore.getState().hidden).toEqual([...DEFAULT_HIDDEN]);
  });

  it('persists only the hidden list under the legacy storage key', () => {
    useConsoleColumnsStore.getState().toggle('zones');
    const raw = localStorage.getItem('zm-console-columns');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as { state: Record<string, unknown> };
    expect(Object.keys(parsed.state)).toEqual(['hidden']);
    expect(parsed.state.hidden).toContain('zones');
  });
});

describe('consoleColumnLabel', () => {
  it('gives every column a distinct caption', () => {
    const labels = CONSOLE_COLUMNS.map((key) => consoleColumnLabel(t, key));
    expect(labels).toEqual([
      'Id', 'Thumbnail', 'Name', 'Manufacturer', 'Model', 'Function', 'Server', 'Source',
      'Storage', 'Events', 'Hour', 'Day', 'Week', 'Month', 'Archived', 'Zones', 'Sequence',
    ]);
    expect(new Set(labels).size).toBe(CONSOLE_COLUMNS.length);
  });
});
