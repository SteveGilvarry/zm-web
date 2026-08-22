/**
 * RuleBuilder — editing, rather than rendering. Every value cell has its own
 * control per attribute kind, and each one has to write the operator's
 * expected string back into the term. The conjunction and bracket selects
 * do the same for the row's structure.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { RuleBuilder } from './RuleBuilder';
import type { FilterQuery, FilterTerm } from '@/api/filters';
import type { Monitor, ZmStorage } from '@/types';

const monitors: Monitor[] = [
  { id: 1, name: 'Front Door' } as unknown as Monitor,
  { id: 2, name: 'Driveway' } as unknown as Monitor,
];
const storage: ZmStorage[] = [
  { id: 1, name: 'Default', path: '/var/cache/zoneminder/events', type: 'local', enabled: 1 },
  { id: 2, name: 'Archive', path: '/mnt/archive', type: 'local', enabled: 1 },
];

function mount(terms: FilterTerm[]) {
  const onChange = vi.fn();
  const query: FilterQuery = { terms };
  renderWithProviders(
    <RuleBuilder query={query} monitors={monitors} storage={storage} onChange={onChange} />,
  );
  return onChange;
}

/** The single term the mount produced, after the change under test. */
const firstTerm = (onChange: ReturnType<typeof vi.fn>): FilterTerm =>
  (onChange.mock.calls[0][0] as FilterQuery).terms[0];

const valueCell = () => screen.getByLabelText('Value');

/* ======================================================================== */
/*  Value cells, one per attribute kind                                     */
/* ======================================================================== */

describe('RuleBuilder — the value cell writes back per attribute kind', () => {
  it('free text for a string attribute', () => {
    const onChange = mount([{ attr: 'Cause', op: '=', val: '' }]);
    fireEvent.change(valueCell(), { target: { value: 'Motion' } });
    expect(firstTerm(onChange)).toMatchObject({ attr: 'Cause', val: 'Motion' });
  });

  it('a number box for a numeric attribute', () => {
    const onChange = mount([{ attr: 'Frames', op: '>', val: '' }]);
    expect(valueCell()).toHaveAttribute('type', 'number');
    fireEvent.change(valueCell(), { target: { value: '120' } });
    expect(firstTerm(onChange)).toMatchObject({ attr: 'Frames', val: '120' });
  });

  it('an All / No / Yes select for a boolean attribute', async () => {
    const user = userEvent.setup();
    const onChange = mount([{ attr: 'Archived', op: '=', val: '' }]);
    const cell = valueCell();
    expect(within(cell).getByRole('option', { name: 'All' })).toBeInTheDocument();
    expect(within(cell).getByRole('option', { name: 'No' })).toBeInTheDocument();
    await user.selectOptions(cell, '1');
    expect(firstTerm(onChange)).toMatchObject({ attr: 'Archived', val: '1' });
  });

  it('a monitor picker keyed by id for MonitorId', async () => {
    const user = userEvent.setup();
    const onChange = mount([{ attr: 'MonitorId', op: '=', val: '' }]);
    await user.selectOptions(valueCell(), '2');
    expect(firstTerm(onChange)).toMatchObject({ attr: 'MonitorId', val: '2' });
  });

  it('a monitor picker keyed by name for MonitorName', async () => {
    const user = userEvent.setup();
    const onChange = mount([{ attr: 'MonitorName', op: '=', val: '' }]);
    await user.selectOptions(valueCell(), 'Driveway');
    expect(firstTerm(onChange)).toMatchObject({ attr: 'MonitorName', val: 'Driveway' });
  });

  it('a storage picker with the NULL / Zero sentinels for StorageId', async () => {
    const user = userEvent.setup();
    const onChange = mount([{ attr: 'StorageId', op: '=', val: '' }]);
    await user.selectOptions(valueCell(), '2');
    expect(firstTerm(onChange)).toMatchObject({ attr: 'StorageId', val: '2' });
  });

  it('a weekday picker numbered Monday = 0 for StartWeekday', async () => {
    const user = userEvent.setup();
    const onChange = mount([{ attr: 'StartWeekday', op: '=', val: '' }]);
    await user.selectOptions(valueCell(), '6');
    expect(firstTerm(onChange)).toMatchObject({ attr: 'StartWeekday', val: '6' });
  });

  it('free text (absolute or relative) for a datetime attribute', () => {
    const onChange = mount([{ attr: 'StartDateTime', op: '>=', val: '' }]);
    fireEvent.change(valueCell(), { target: { value: '-1 day' } });
    expect(firstTerm(onChange)).toMatchObject({ attr: 'StartDateTime', val: '-1 day' });
  });

  it('a date box for a date attribute', () => {
    const onChange = mount([{ attr: 'StartDate', op: '=', val: '' }]);
    expect(valueCell()).toHaveAttribute('type', 'date');
    fireEvent.change(valueCell(), { target: { value: '2026-05-24' } });
    expect(firstTerm(onChange)).toMatchObject({ attr: 'StartDate', val: '2026-05-24' });
  });

  it('a seconds-resolution time box for a time attribute', () => {
    const onChange = mount([{ attr: 'StartTime', op: '>=', val: '' }]);
    expect(valueCell()).toHaveAttribute('type', 'time');
    expect(valueCell()).toHaveAttribute('step', '1');
    fireEvent.change(valueCell(), { target: { value: '22:30:00' } });
    expect(firstTerm(onChange)).toMatchObject({ attr: 'StartTime', val: '22:30:00' });
  });
});

/* ======================================================================== */
/*  Operator-driven value cells                                             */
/* ======================================================================== */

describe('RuleBuilder — the operator can override the value cell', () => {
  it('IS / IS NOT swap in the NULL / Zero / set picker whatever the attribute', async () => {
    const user = userEvent.setup();
    const onChange = mount([{ attr: 'EndDateTime', op: 'IS NOT', val: 'NULL' }]);
    const cell = valueCell();
    expect(within(cell).getByRole('option', { name: 'NULL (unspecified)' })).toBeInTheDocument();
    await user.selectOptions(cell, '1');
    expect(firstTerm(onChange)).toMatchObject({ attr: 'EndDateTime', op: 'IS NOT', val: '1' });
  });

  it('=[] and ![] swap in a comma-separated free-text box', () => {
    const onChange = mount([{ attr: 'MonitorId', op: '=[]', val: '' }]);
    const cell = valueCell();
    expect(cell).toHaveAttribute('placeholder', 'comma,separated,list');
    fireEvent.change(cell, { target: { value: '1,2,3' } });
    expect(firstTerm(onChange)).toMatchObject({ attr: 'MonitorId', op: '=[]', val: '1,2,3' });
  });

  it('the set box wins over the monitor picker even for a monitor attribute', () => {
    mount([{ attr: 'MonitorId', op: '![]', val: '1' }]);
    expect(valueCell().tagName).toBe('INPUT');
  });
});

/* ======================================================================== */
/*  Row structure                                                           */
/* ======================================================================== */

describe('RuleBuilder — row structure controls', () => {
  const twoTerms: FilterTerm[] = [
    { attr: 'Cause', op: '=', val: 'Motion' },
    { cnj: 'and', obr: '0', attr: 'Frames', op: '>', val: '10', cbr: '0' },
  ];

  it('the first row has no conjunction select, later rows do', () => {
    mount(twoTerms);
    expect(screen.getByText('where')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Conjunction')).toHaveLength(1);
  });

  it('switching a conjunction to "or" rewrites that term only', async () => {
    const user = userEvent.setup();
    const onChange = mount(twoTerms);
    await user.selectOptions(screen.getByLabelText('Conjunction'), 'or');
    const terms = (onChange.mock.calls[0][0] as FilterQuery).terms;
    expect(terms[0].cnj).toBeUndefined();
    expect(terms[1].cnj).toBe('or');
  });

  it('the operator select rewrites the term operator', async () => {
    const user = userEvent.setup();
    const onChange = mount([{ attr: 'Frames', op: '>', val: '10' }]);
    await user.selectOptions(screen.getByLabelText('Operator'), '<=');
    expect(firstTerm(onChange)).toMatchObject({ op: '<=' });
  });

  it('an operator the attribute kind does not normally offer is still shown when the row uses it', () => {
    mount([{ attr: 'Archived', op: 'LIKE', val: '1' }]);
    const ops = within(screen.getByLabelText('Operator')).getAllByRole('option').map((o) => o.getAttribute('value'));
    expect(ops[0]).toBe('LIKE');
  });

  it('the close-bracket select emits a count as a string', async () => {
    const user = userEvent.setup();
    const onChange = mount([{ attr: 'Cause', op: '=', val: 'x', obr: '0', cbr: '0' }]);
    await user.selectOptions(screen.getByLabelText('Close brackets'), '2');
    expect(firstTerm(onChange)).toMatchObject({ cbr: '2' });
  });

  it('the open-bracket select emits a count as a string', async () => {
    const user = userEvent.setup();
    const onChange = mount([{ attr: 'Cause', op: '=', val: 'x', obr: '0', cbr: '0' }]);
    await user.selectOptions(screen.getByLabelText('Open brackets'), '3');
    expect(firstTerm(onChange)).toMatchObject({ obr: '3' });
  });
});
