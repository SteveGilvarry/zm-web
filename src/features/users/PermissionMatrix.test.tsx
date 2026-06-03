import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PermissionMatrix,
  buildTopLevelRows,
  computeEffectivePermission,
  PERMISSION_NAMES,
  MONITOR_LEVEL_OPTIONS,
  INHERIT_LEVEL_OPTIONS,
} from './PermissionMatrix';

const mkUser = (over: Partial<Record<string, string>> = {}) => ({
  stream: 'View',
  events: 'Edit',
  control: 'None',
  monitors: 'View',
  groups: 'None',
  devices: 'None',
  snapshots: 'View',
  system: 'Edit',
  ...over,
});

describe('PERMISSION_NAMES constant', () => {
  it('exposes the 8 ZoneMinder permission keys in the legacy order', () => {
    expect(PERMISSION_NAMES).toEqual([
      'stream', 'events', 'control', 'monitors', 'groups', 'devices', 'snapshots', 'system',
    ]);
  });
});

describe('buildTopLevelRows', () => {
  it('returns one row per permission with the current user value', () => {
    const rows = buildTopLevelRows(mkUser());
    expect(rows).toHaveLength(8);
    const monitorsRow = rows.find((r) => r.key === 'monitors')!;
    expect(monitorsRow.value).toBe('View');
    expect(monitorsRow.options).toEqual(MONITOR_LEVEL_OPTIONS);
  });

  it('uses the 2-level option set for `stream`', () => {
    const rows = buildTopLevelRows(mkUser());
    const streamRow = rows.find((r) => r.key === 'stream')!;
    expect(streamRow.options).toEqual(['None', 'View']);
  });

  it('defaults missing user values to None', () => {
    // simulate an API response where a field is the empty string
    const rows = buildTopLevelRows(mkUser({ control: '' }));
    const controlRow = rows.find((r) => r.key === 'control')!;
    expect(controlRow.value).toBe('None');
  });
});

describe('PermissionMatrix — rendering', () => {
  it('renders one radio per (row, option) and marks the current value checked', () => {
    const rows = buildTopLevelRows(mkUser());
    render(<PermissionMatrix rows={rows} readOnly />);
    // 8 rows × header column. Spot-check: Events row should have a checked Edit radio.
    const editEventsRadio = screen.getByRole('radio', { name: /events: edit/i }) as HTMLInputElement;
    expect(editEventsRadio.checked).toBe(true);
    expect(editEventsRadio.disabled).toBe(true);
  });

  it('disables every radio when readOnly is true', () => {
    const rows = buildTopLevelRows(mkUser());
    render(<PermissionMatrix rows={rows} readOnly />);
    const all = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((r) => r.disabled)).toBe(true);
  });

  it('calls onChange(rowKey, newLevel) when a radio is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const rows = buildTopLevelRows(mkUser());
    render(<PermissionMatrix rows={rows} onChange={onChange} />);
    const noneStream = screen.getByRole('radio', { name: /stream: none/i });
    await user.click(noneStream);
    expect(onChange).toHaveBeenCalledWith('stream', 'None');
  });

  it('renders a dash placeholder for options not available on a row', () => {
    // Stream row only allows None/View. The Edit / Create columns should
    // render placeholders.
    const rows = buildTopLevelRows(mkUser());
    render(<PermissionMatrix rows={rows} readOnly />);
    // The placeholder is the em-dash; there must be at least two
    // (stream row missing Edit + Create).
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('renders the trailing column when trailingHeader is provided', () => {
    render(
      <PermissionMatrix
        rows={[
          {
            key: 'r1',
            label: 'Front Door',
            value: 'Inherit',
            options: INHERIT_LEVEL_OPTIONS,
            trailing: <span data-testid="eff">Edit</span>,
          },
        ]}
        readOnly
        trailingHeader="Effective"
      />,
    );
    expect(screen.getByText('Effective')).toBeInTheDocument();
    expect(screen.getByTestId('eff')).toHaveTextContent('Edit');
  });
});

describe('computeEffectivePermission', () => {
  it('uses the per-monitor permission when not Inherit', () => {
    expect(
      computeEffectivePermission({
        monitorPermission: 'Edit',
        groupIds: [1, 2],
        groupPermissions: { 1: 'None', 2: 'None' },
        globalMonitors: 'View',
      }),
    ).toBe('Edit');
  });

  it('falls through to the most-permissive group permission when monitor=Inherit', () => {
    expect(
      computeEffectivePermission({
        monitorPermission: 'Inherit',
        groupIds: [1, 2, 3],
        groupPermissions: { 1: 'None', 2: 'View', 3: 'Edit' },
        globalMonitors: 'None',
      }),
    ).toBe('Edit');
  });

  it('ignores groups whose permission is Inherit or absent', () => {
    expect(
      computeEffectivePermission({
        monitorPermission: 'Inherit',
        groupIds: [1, 2],
        groupPermissions: { 1: 'Inherit' /* 2 absent */ },
        globalMonitors: 'View',
      }),
    ).toBe('View');
  });

  it('falls back to the global monitors level when nothing overrides', () => {
    expect(
      computeEffectivePermission({
        monitorPermission: 'Inherit',
        groupIds: [],
        groupPermissions: {},
        globalMonitors: 'View',
      }),
    ).toBe('View');
  });

  it('defaults to None when global is empty/undefined', () => {
    expect(
      computeEffectivePermission({
        monitorPermission: 'Inherit',
        groupIds: [],
        groupPermissions: {},
        globalMonitors: '',
      }),
    ).toBe('None');
  });

  it('returns None when monitor permission is explicitly None even with permissive groups', () => {
    // monitor-level None must win over group-level Edit — explicit deny.
    expect(
      computeEffectivePermission({
        monitorPermission: 'None',
        groupIds: [1],
        groupPermissions: { 1: 'Edit' },
        globalMonitors: 'Edit',
      }),
    ).toBe('None');
  });
});
