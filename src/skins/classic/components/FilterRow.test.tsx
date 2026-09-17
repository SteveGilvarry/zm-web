/**
 * Legacy `_monitor_filters.php` row: labelled controls, every select
 * `multiple` as legacy's Chosen widgets are, the wire values behind their
 * translated labels, Server/Storage only when the box has more than one, and
 * the per-field clear (×). Driven with a stub `MonitorFilterRowState` so this
 * stays a unit test of the presentation — the hook has its own coverage.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { Monitor } from '@/types';
import type {
  FilterRowField, FilterRowValues, MonitorFilterRowState,
} from '@/features/monitors/useMonitorFilterRow';
import { FILTER_ROW_FIELDS, splitValues } from '@/features/monitors/useMonitorFilterRow';
import { ClassicFilterRow } from './FilterRow';

const monitors = [
  { id: 1, name: 'Front Door' },
  { id: 2, name: 'Driveway East' },
] as unknown as Monitor[];

const groups = [
  { id: 7, name: 'Perimeter' },
  { id: 8, name: 'Indoors' },
] as unknown as MonitorFilterRowState['groups'];

const EMPTY: FilterRowValues = {
  groupId: '', name: '', capturing: '', analysing: '',
  recording: '', status: '', source: '', monitorId: '',
  serverId: '', storageId: '',
};

const set = vi.fn();
const setMulti = vi.fn();
const clear = vi.fn();

function makeState(
  values: Partial<FilterRowValues> = {},
  over: Partial<Pick<MonitorFilterRowState, 'servers' | 'storages'>> = {},
): MonitorFilterRowState {
  const merged = { ...EMPTY, ...values };
  return {
    groups,
    servers: [],
    storages: [],
    ...over,
    values: merged,
    valuesMulti: Object.fromEntries(
      FILTER_ROW_FIELDS.map((f) => [f, splitValues(merged[f])]),
    ) as Record<FilterRowField, string[]>,
    set,
    setMulti,
    clear,
    reset: vi.fn(),
    filtered: monitors,
    activeCount: Object.values(merged).filter((v) => v !== '').length,
  };
}

function mount(
  values?: Partial<FilterRowValues>,
  tone?: 'light' | 'dark',
  over?: Partial<Pick<MonitorFilterRowState, 'servers' | 'storages'>>,
) {
  return renderWithProviders(
    <ClassicFilterRow monitors={monitors} state={makeState(values, over)} tone={tone} className="mb-2" />,
  );
}

/** A `<select multiple>` is a listbox, not a combobox. */
const optionLabels = (name: string) =>
  within(screen.getByRole('listbox', { name })).getAllByRole('option').map((o) => o.textContent);

beforeEach(() => { set.mockClear(); setMulti.mockClear(); clear.mockClear(); });

describe('ClassicFilterRow', () => {
  it('renders the legacy fields in order under one named group', () => {
    mount();
    const group = screen.getByRole('group', { name: 'Monitor filter bar' });
    expect(within(group).getAllByRole('listbox')).toHaveLength(6);
    expect(within(group).getAllByRole('textbox')).toHaveLength(2);
    for (const label of ['GroupId', 'Capturing', 'Analysing', 'Recording', 'Status', 'Monitor']) {
      expect(screen.getByRole('listbox', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Source' })).toBeInTheDocument();
  });

  it('makes every select multiple, as legacy does', () => {
    mount();
    for (const label of ['GroupId', 'Capturing', 'Status', 'Monitor']) {
      expect(screen.getByRole('listbox', { name: label })).toHaveAttribute('multiple');
    }
  });

  it('lists the groups the hook supplied, with no "All" option', () => {
    mount();
    expect(optionLabels('GroupId')).toEqual(['Perimeter', 'Indoors']);
    const group = screen.getByRole('listbox', { name: 'GroupId' });
    expect(within(group).getByRole('option', { name: 'Perimeter' })).toHaveValue('7');
  });

  it('translates the capture-mode wire values', () => {
    mount();
    expect(optionLabels('Capturing')).toEqual(['None', 'On Demand', 'Always']);
    expect(optionLabels('Analysing')).toEqual(['None', 'Always']);
    expect(optionLabels('Recording')).toEqual(['None', 'On Motion', 'Always']);
  });

  it('translates the runtime status values the way legacy did, without Deleted', () => {
    mount();
    // `Running` means the daemon is up but not yet capturing. Legacy's
    // `Deleted` pseudo-status is omitted: the API cannot list deleted monitors.
    expect(optionLabels('Status')).toEqual(['Unknown', 'Not Running', 'Not Capturing', 'Capturing']);
    const status = screen.getByRole('listbox', { name: 'Status' });
    expect(within(status).getByRole('option', { name: 'Capturing' })).toHaveValue('Connected');
    expect(within(status).getByRole('option', { name: 'Not Capturing' })).toHaveValue('Running');
  });

  it('labels each monitor option with its id', () => {
    mount();
    expect(optionLabels('Monitor')).toEqual(['1 Front Door', '2 Driveway East']);
  });

  it('hides Server and Storage until the box has more than one', () => {
    mount();
    expect(screen.queryByRole('listbox', { name: 'Server' })).not.toBeInTheDocument();
    expect(screen.queryByRole('listbox', { name: 'Storage' })).not.toBeInTheDocument();
  });

  it('shows Server and Storage once there are two of either', () => {
    mount({}, undefined, {
      servers: [{ id: 1, name: 'zm1' }, { id: 2, name: 'zm2' }] as MonitorFilterRowState['servers'],
      storages: [{ id: 1, name: 'Default' }, { id: 2, name: 'Archive' }] as MonitorFilterRowState['storages'],
    });
    expect(optionLabels('Server')).toEqual(['zm1', 'zm2']);
    expect(optionLabels('Storage')).toEqual(['Default', 'Archive']);
  });

  it('reflects the current values, several at a time', () => {
    mount({ groupId: '8', capturing: 'Always', status: 'NotRunning,Connected', monitorId: '1,2', name: 'door', source: '10.0.0' });
    expect(screen.getByRole('listbox', { name: 'GroupId' })).toHaveValue(['8']);
    expect(screen.getByRole('listbox', { name: 'Status' })).toHaveValue(['NotRunning', 'Connected']);
    expect(screen.getByRole('listbox', { name: 'Monitor' })).toHaveValue(['1', '2']);
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('door');
    expect(screen.getByRole('textbox', { name: 'Source' })).toHaveValue('10.0.0');
  });

  it('reports a select change as the whole selection', async () => {
    mount();
    await userEvent.selectOptions(screen.getByRole('listbox', { name: 'Recording' }), 'OnMotion');
    expect(setMulti).toHaveBeenCalledWith('recording', ['OnMotion']);

    // The stub never echoes a selection back, so each click reports only
    // what the DOM holds at that moment — the field name is the point here.
    await userEvent.selectOptions(screen.getByRole('listbox', { name: 'Monitor' }), ['1']);
    expect(setMulti).toHaveBeenLastCalledWith('monitorId', ['1']);
  });

  it('reports typed text per keystroke against its field name', async () => {
    mount();
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'ab');
    expect(set).toHaveBeenNthCalledWith(1, 'name', 'a');
    // Value is controlled by the stub, so each keystroke starts from ''.
    expect(set).toHaveBeenNthCalledWith(2, 'name', 'b');
  });

  it('hints that the text fields accept a regular expression', () => {
    mount();
    expect(screen.getByRole('textbox', { name: 'Name' }))
      .toHaveAttribute('placeholder', 'text or regular expression');
  });

  it('disables the clear button until the field has a value', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Clear groupid' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear monitor' })).toBeDisabled();
  });

  it('clears the field it belongs to', async () => {
    mount({ capturing: 'Always', groupId: '7' });
    const clearCapturing = screen.getByRole('button', { name: 'Clear capturing' });
    expect(clearCapturing).toBeEnabled();

    await userEvent.click(clearCapturing);
    expect(clear).toHaveBeenCalledWith('capturing');

    await userEvent.click(screen.getByRole('button', { name: 'Clear groupid' }));
    expect(clear).toHaveBeenLastCalledWith('groupId');
  });

  it('renders on the dark header band too', () => {
    mount({}, 'dark');
    expect(screen.getByRole('group', { name: 'Monitor filter bar' })).toBeInTheDocument();
  });

  it('offers nothing to pick when there are no groups or monitors', () => {
    const state = makeState();
    state.groups = [];
    renderWithProviders(<ClassicFilterRow monitors={[]} state={state} />);
    expect(within(screen.getByRole('listbox', { name: 'GroupId' })).queryAllByRole('option')).toHaveLength(0);
    expect(within(screen.getByRole('listbox', { name: 'Monitor' })).queryAllByRole('option')).toHaveLength(0);
  });
});
