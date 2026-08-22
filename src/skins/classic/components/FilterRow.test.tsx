/**
 * Legacy `_monitor_filters.php` row: eight labelled controls, the wire
 * values behind their translated labels, and the per-field clear (×).
 * Driven with a stub `MonitorFilterRowState` so this stays a unit test of
 * the presentation — the hook has its own coverage.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import type { Monitor } from '@/types';
import type {
  FilterRowValues, MonitorFilterRowState,
} from '@/features/monitors/useMonitorFilterRow';
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
};

const set = vi.fn();
const clear = vi.fn();

function makeState(values: Partial<FilterRowValues> = {}): MonitorFilterRowState {
  const merged = { ...EMPTY, ...values };
  return {
    groups,
    values: merged,
    set,
    clear,
    reset: vi.fn(),
    filtered: monitors,
    activeCount: Object.values(merged).filter((v) => v !== '').length,
  };
}

function mount(values?: Partial<FilterRowValues>, tone?: 'light' | 'dark') {
  return renderWithProviders(
    <ClassicFilterRow monitors={monitors} state={makeState(values)} tone={tone} className="mb-2" />,
  );
}

const optionLabels = (name: string) =>
  within(screen.getByRole('combobox', { name })).getAllByRole('option').map((o) => o.textContent);

beforeEach(() => { set.mockClear(); clear.mockClear(); });

describe('ClassicFilterRow', () => {
  it('renders the eight legacy fields in order under one named group', () => {
    mount();
    const group = screen.getByRole('group', { name: 'Monitor filter bar' });
    expect(within(group).getAllByRole('combobox')).toHaveLength(6);
    expect(within(group).getAllByRole('textbox')).toHaveLength(2);
    for (const label of ['GroupId', 'Capturing', 'Analysing', 'Recording', 'Status', 'Monitor']) {
      expect(screen.getByRole('combobox', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Source' })).toBeInTheDocument();
  });

  it('lists the groups the hook supplied, behind an "All" default', () => {
    mount();
    expect(optionLabels('GroupId')).toEqual(['All', 'Perimeter', 'Indoors']);
    const group = screen.getByRole('combobox', { name: 'GroupId' });
    expect(within(group).getByRole('option', { name: 'Perimeter' })).toHaveValue('7');
  });

  it('translates the capture-mode wire values', () => {
    mount();
    expect(optionLabels('Capturing')).toEqual(['All', 'None', 'On Demand', 'Always']);
    expect(optionLabels('Analysing')).toEqual(['All', 'None', 'Always']);
    expect(optionLabels('Recording')).toEqual(['All', 'None', 'On Motion', 'Always']);
  });

  it('translates the runtime status values the way legacy did', () => {
    mount();
    // `Running` means the daemon is up but not yet capturing.
    expect(optionLabels('Status')).toEqual(['All', 'Unknown', 'Not Running', 'Not Capturing', 'Capturing']);
    const status = screen.getByRole('combobox', { name: 'Status' });
    expect(within(status).getByRole('option', { name: 'Capturing' })).toHaveValue('Connected');
    expect(within(status).getByRole('option', { name: 'Not Capturing' })).toHaveValue('Running');
  });

  it('labels each monitor option with its id', () => {
    mount();
    expect(optionLabels('Monitor')).toEqual(['All', '1 Front Door', '2 Driveway East']);
  });

  it('reflects the current values', () => {
    mount({ groupId: '8', capturing: 'Always', status: 'NotRunning', monitorId: '2', name: 'door', source: '10.0.0' });
    expect(screen.getByRole('combobox', { name: 'GroupId' })).toHaveValue('8');
    expect(screen.getByRole('combobox', { name: 'Capturing' })).toHaveValue('Always');
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('NotRunning');
    expect(screen.getByRole('combobox', { name: 'Monitor' })).toHaveValue('2');
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('door');
    expect(screen.getByRole('textbox', { name: 'Source' })).toHaveValue('10.0.0');
  });

  it('reports a select change against its field name', async () => {
    mount();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Recording' }), 'OnMotion');
    expect(set).toHaveBeenCalledWith('recording', 'OnMotion');

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Monitor' }), '2');
    expect(set).toHaveBeenLastCalledWith('monitorId', '2');
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

  it('offers only "All" when there are no groups or monitors', () => {
    const state = makeState();
    state.groups = [];
    renderWithProviders(<ClassicFilterRow monitors={[]} state={state} />);
    expect(optionLabels('GroupId')).toEqual(['All']);
    expect(optionLabels('Monitor')).toEqual(['All']);
  });
});
