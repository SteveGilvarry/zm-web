/**
 * Legacy `_monitor_filters.php` row: labelled controls, every select a
 * Chosen multi-select with "All" for its placeholder, the wire values behind
 * their translated labels, Server/Storage only when the box has more than
 * one, and the per-field clear (×). Driven with a stub `MonitorFilterRowState`
 * so this stays a unit test of the presentation — the hook has its own
 * coverage, and the picker itself is tested in `Chosen.test.tsx`.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { chosenChips } from '@/test/chosen';
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
    groupOptions: groups.map((g) => ({ id: g.id, name: g.name, depth: 0 })),
    monitorOptions: monitors,
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
    <ClassicFilterRow state={makeState(values, over)} tone={tone} className="mb-2" />,
  );
}

const picker = (name: string) => screen.getByRole('combobox', { name });

/** Open a picker and read its drop; `data-value` carries the wire value. */
async function openDrop(name: string) {
  await userEvent.click(picker(name));
  const list = screen.getByRole('listbox', { name });
  const options = within(list).getAllByRole('option');
  await userEvent.keyboard('{Escape}');
  return options.map((o) => ({ label: o.textContent, value: o.getAttribute('data-value') }));
}
const optionLabels = async (name: string) => (await openDrop(name)).map((o) => o.label);

beforeEach(() => { set.mockClear(); setMulti.mockClear(); clear.mockClear(); });

describe('ClassicFilterRow', () => {
  it('renders the legacy fields in order under one named group', () => {
    mount();
    const group = screen.getByRole('group', { name: 'Monitor filter bar' });
    expect(within(group).getAllByRole('combobox')).toHaveLength(6);
    expect(within(group).getAllByRole('textbox')).toHaveLength(2);
    for (const label of ['GroupId', 'Capturing', 'Analysing', 'Recording', 'Status', 'Monitor']) {
      expect(picker(label)).toBeInTheDocument();
    }
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Source' })).toBeInTheDocument();
  });

  it('shows "All" in every empty picker, as legacy\'s Chosen placeholder does', () => {
    mount();
    for (const label of ['GroupId', 'Capturing', 'Status', 'Monitor']) {
      expect(picker(label)).toHaveAttribute('placeholder', 'All');
    }
  });

  it('lists the groups the hook supplied, with no "All" option', async () => {
    mount();
    expect(await openDrop('GroupId')).toEqual([
      { label: 'Perimeter', value: '7' },
      { label: 'Indoors', value: '8' },
    ]);
  });

  it('translates the capture-mode wire values', async () => {
    mount();
    expect(await optionLabels('Capturing')).toEqual(['None', 'On Demand', 'Always']);
    expect(await optionLabels('Analysing')).toEqual(['None', 'Always']);
    expect(await optionLabels('Recording')).toEqual(['None', 'On Motion', 'Always']);
  });

  it('translates the runtime status values the way legacy did, Deleted last', async () => {
    mount();
    // `Running` means the daemon is up but not yet capturing; `Deleted` is
    // legacy's pseudo-status for soft-deleted monitors.
    expect(await openDrop('Status')).toEqual([
      { label: 'Unknown', value: 'Unknown' },
      { label: 'Not Running', value: 'NotRunning' },
      { label: 'Not Capturing', value: 'Running' },
      { label: 'Capturing', value: 'Connected' },
      { label: 'Deleted', value: 'Deleted' },
    ]);
  });

  it('labels each monitor option with its id', async () => {
    mount();
    expect(await optionLabels('Monitor')).toEqual(['1 Front Door', '2 Driveway East']);
  });

  it('indents child groups under their parent', async () => {
    const state = makeState();
    state.groupOptions = [{ id: 1, name: 'Outside', depth: 0 }, { id: 2, name: 'Yard', depth: 1 }];
    renderWithProviders(<ClassicFilterRow state={state} />);
    expect(await optionLabels('GroupId')).toEqual(['Outside', '   Yard']);
  });

  it('lists the monitors the hook narrowed to, not every monitor', async () => {
    const state = makeState();
    state.monitorOptions = [monitors[1]];
    renderWithProviders(<ClassicFilterRow state={state} />);
    expect(await optionLabels('Monitor')).toEqual(['2 Driveway East']);
  });

  it('hides Server and Storage until the box has more than one', () => {
    mount();
    expect(screen.queryByRole('combobox', { name: 'Server' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Storage' })).not.toBeInTheDocument();
  });

  it('shows Server and Storage once there are two of either', async () => {
    mount({}, undefined, {
      servers: [{ id: 1, name: 'zm1' }, { id: 2, name: 'zm2' }] as MonitorFilterRowState['servers'],
      storages: [{ id: 1, name: 'Default' }, { id: 2, name: 'Archive' }] as MonitorFilterRowState['storages'],
    });
    expect(await optionLabels('Server')).toEqual(['zm1', 'zm2']);
    expect(await optionLabels('Storage')).toEqual(['Default', 'Archive']);
  });

  it('reflects the current values as chips, several at a time', () => {
    mount({ groupId: '8', capturing: 'Always', status: 'NotRunning,Connected', monitorId: '1,2', name: 'door', source: '10.0.0' });
    expect(chosenChips('GroupId')).toEqual(['Indoors']);
    expect(chosenChips('Capturing')).toEqual(['Always']);
    expect(chosenChips('Status')).toEqual(['Not Running', 'Capturing']);
    expect(chosenChips('Monitor')).toEqual(['1 Front Door', '2 Driveway East']);
    expect(picker('Status')).not.toHaveAttribute('placeholder');
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('door');
    expect(screen.getByRole('textbox', { name: 'Source' })).toHaveValue('10.0.0');
  });

  it('reports a pick as the whole selection, wire values not labels', async () => {
    mount({ status: 'Unknown' });
    await userEvent.click(picker('Recording'));
    await userEvent.click(screen.getByRole('option', { name: 'On Motion' }));
    expect(setMulti).toHaveBeenCalledWith('recording', ['OnMotion']);

    await userEvent.click(picker('Status'));
    await userEvent.click(screen.getByRole('option', { name: 'Capturing' }));
    expect(setMulti).toHaveBeenLastCalledWith('status', ['Unknown', 'Connected']);
  });

  it('removing the last chip clears the field rather than setting it empty', async () => {
    mount({ capturing: 'Always' });
    await userEvent.click(screen.getByRole('button', { name: 'Remove Always' }));
    expect(clear).toHaveBeenCalledWith('capturing');
    expect(setMulti).not.toHaveBeenCalled();
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

  it('labels every control from beside it, never around it', () => {
    // A wrapping <label> would re-fire each click inside the picker on the
    // first chip's × and undo the pick (label activation).
    mount({ capturing: 'Always' });
    for (const control of [picker('Capturing'), screen.getByRole('textbox', { name: 'Name' })]) {
      expect(control.closest('label')).toBeNull();
      expect(control).toHaveAccessibleName();
    }
    expect(screen.getByText('Capturing', { selector: 'label' })).toHaveAttribute('for', picker('Capturing').id);
  });

  it('renders on the dark header band too', () => {
    mount({}, 'dark');
    expect(screen.getByRole('group', { name: 'Monitor filter bar' })).toBeInTheDocument();
  });

  it('offers nothing to pick when there are no groups or monitors', async () => {
    const state = makeState();
    state.groupOptions = [];
    state.monitorOptions = [];
    renderWithProviders(<ClassicFilterRow state={state} />);
    await userEvent.click(picker('GroupId'));
    expect(within(screen.getByRole('listbox', { name: 'GroupId' })).queryAllByRole('option')).toHaveLength(0);
    await userEvent.keyboard('{Escape}');
    await userEvent.click(picker('Monitor'));
    expect(within(screen.getByRole('listbox', { name: 'Monitor' })).queryAllByRole('option')).toHaveLength(0);
  });
});
