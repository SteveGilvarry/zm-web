import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { RuleBuilder } from './RuleBuilder';
import { normaliseTerms } from './terms';
import type { FilterQuery } from '@/api/filters';
import type { Monitor, ZmStorage } from '@/types';

const monitors: Monitor[] = [
  { id: 1, name: 'Front Door' } as unknown as Monitor,
  { id: 2, name: 'Driveway' } as unknown as Monitor,
];
const storage: ZmStorage[] = [
  { id: 1, name: 'Default', path: '/var/cache/zoneminder/events', type: 'local', enabled: 1 },
];

function mount(query: FilterQuery, onChange = vi.fn()) {
  renderWithProviders(
    <RuleBuilder query={query} monitors={monitors} storage={storage} onChange={onChange} />,
  );
  return onChange;
}

describe('RuleBuilder — empty state', () => {
  it('shows the hint and an Add condition button', () => {
    mount({ terms: [] });
    expect(screen.getByText(/no conditions yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add condition/i })).toBeInTheDocument();
  });

  it('adds a ZM-shaped term (no cnj on the first term, string brackets)', async () => {
    const user = userEvent.setup();
    const onChange = mount({ terms: [] });
    await user.click(screen.getByRole('button', { name: /add condition/i }));
    const next = onChange.mock.calls[0][0] as FilterQuery;
    expect(next.terms).toEqual([{ obr: '0', attr: 'MonitorId', op: '=', val: '1', cbr: '0' }]);
  });
});

describe('RuleBuilder — existing terms', () => {
  const query: FilterQuery = {
    terms: [
      { obr: '0', attr: 'Cause', op: 'LIKE', val: 'motion', cbr: '0' },
      { cnj: 'or', obr: '0', attr: 'MaxScore', op: '>', val: '50', cbr: '0' },
    ],
    sort_field: 'Id',
  };

  it('renders one row per term with attr / op / value controls', () => {
    mount(query);
    const rows = screen.getAllByTestId('filter-term');
    expect(rows).toHaveLength(2);
    expect(screen.getByText(/^where$/i)).toBeInTheDocument();
    expect((within(rows[0]).getByLabelText('Attribute') as HTMLSelectElement).value).toBe('Cause');
    expect((within(rows[0]).getByLabelText('Operator') as HTMLSelectElement).value).toBe('LIKE');
    expect(screen.getByDisplayValue('motion')).toBeInTheDocument();
    expect((within(rows[1]).getByLabelText('Conjunction') as HTMLSelectElement).value).toBe('or');
    expect(screen.getByDisplayValue('50')).toBeInTheDocument();
  });

  it('groups server-side-only attributes separately and lists all 43', () => {
    mount(query);
    const attr = within(screen.getAllByTestId('filter-term')[0]).getByLabelText('Attribute');
    const groups = attr.querySelectorAll('optgroup');
    expect(groups).toHaveLength(2);
    expect(groups[1].getAttribute('label')).toMatch(/server-side evaluation only/i);
    expect(attr.querySelectorAll('option')).toHaveLength(43);
    expect(within(groups[1]).getByText('Disk Percent')).toBeInTheDocument();
    expect(within(groups[0]).getByText('Archive Status')).toBeInTheDocument();
  });

  it('offers the 14 legacy operators for string attributes (pruned per kind), never contains/starts/ends', () => {
    mount(query);
    const rows = screen.getAllByTestId('filter-term');
    const stringOps = Array.from(within(rows[0]).getByLabelText('Operator').querySelectorAll('option')).map((o) => o.textContent);
    expect(stringOps).toEqual(['=', '!=', '=~', '!~', '=[]', '![]', 'LIKE', 'NOT LIKE', 'IS', 'IS NOT']);
    const numberOps = Array.from(within(rows[1]).getByLabelText('Operator').querySelectorAll('option')).map((o) => o.textContent);
    expect(numberOps).toEqual(['=', '!=', '>=', '>', '<', '<=', '=[]', '![]', 'IS', 'IS NOT']);
    expect(stringOps).not.toContain('contains');
  });

  it('removing the first term promotes the next one and drops its cnj; other keys survive', async () => {
    const user = userEvent.setup();
    const onChange = mount({ ...query, terms: [{ ...query.terms[0], extra: 'keep' }, query.terms[1]] });
    await user.click(screen.getAllByRole('button', { name: /remove condition/i })[0]);
    const next = onChange.mock.calls[0][0] as FilterQuery;
    expect(next.terms).toEqual([{ obr: '0', attr: 'MaxScore', op: '>', val: '50', cbr: '0' }]);
    expect(next.sort_field).toBe('Id');
  });

  it('keeps unknown term properties when editing a value', async () => {
    const user = userEvent.setup();
    const onChange = mount({ terms: [{ attr: 'MaxScore', op: '>', val: '50', custom: true }] });
    const value = screen.getByLabelText('Value');
    await user.clear(value);
    await user.type(value, '7');
    const last = onChange.mock.calls.at(-1)![0] as FilterQuery;
    expect(last.terms[0]).toMatchObject({ attr: 'MaxScore', op: '>', custom: true });
  });

  it('changing the attribute resets op when it no longer applies and clears val', async () => {
    const user = userEvent.setup();
    const onChange = mount({ terms: [{ attr: 'Cause', op: '=~', val: '^x' }] });
    await user.selectOptions(screen.getByLabelText('Attribute'), 'MaxScore');
    const next = onChange.mock.calls[0][0] as FilterQuery;
    expect(next.terms[0]).toEqual({ attr: 'MaxScore', op: '=', val: '' });
  });

  it('emits bracket counts as strings', async () => {
    const user = userEvent.setup();
    const onChange = mount({ terms: [{ attr: 'Cause', op: '=', val: 'Motion', obr: '0', cbr: '0' }] });
    await user.selectOptions(screen.getByLabelText(/open brackets/i), '2');
    expect((onChange.mock.calls[0][0] as FilterQuery).terms[0].obr).toBe('2');
  });
});

describe('RuleBuilder — value cells', () => {
  it('IS / IS NOT restrict the value to NULL / 0 / 1', () => {
    mount({ terms: [{ attr: 'Notes', op: 'IS', val: 'NULL' }] });
    expect(screen.getByText(/NULL \(unspecified\)/i)).toBeInTheDocument();
    expect(screen.getByText(/^Zero$/)).toBeInTheDocument();
  });

  it('MonitorId picks ids, MonitorName picks names', () => {
    mount({ terms: [
      { attr: 'MonitorId', op: '=', val: '2' },
      { cnj: 'and', attr: 'MonitorName', op: '=', val: 'Driveway' },
    ] });
    const rows = screen.getAllByTestId('filter-term');
    const byId = within(rows[0]).getByLabelText('Value') as HTMLSelectElement;
    const byName = within(rows[1]).getByLabelText('Value') as HTMLSelectElement;
    expect(Array.from(byId.options).map((o) => o.value)).toEqual(['', '1', '2']);
    expect(Array.from(byName.options).map((o) => o.value)).toEqual(['', 'Front Door', 'Driveway']);
    expect(byId.value).toBe('2');
    expect(byName.value).toBe('Driveway');
  });

  it('StorageId lists storage areas with the NULL / Zero sentinels', () => {
    mount({ terms: [{ attr: 'StorageId', op: '=', val: '1' }] });
    const sel = screen.getByLabelText('Value') as HTMLSelectElement;
    expect(Array.from(sel.options).map((o) => o.value)).toEqual(['', '0', '1']);
    expect(sel.value).toBe('1');
  });

  it('StartWeekday is Mon..Sun = 0..6', () => {
    mount({ terms: [{ attr: 'StartWeekday', op: '=', val: '6' }] });
    const sel = screen.getByLabelText('Value') as HTMLSelectElement;
    expect(sel.options[7].textContent).toBe('Sun');
    expect(sel.options[7].value).toBe('6');
  });

  it('datetime attributes accept free text (absolute or relative)', () => {
    mount({ terms: [{ attr: 'StartDateTime', op: '>=', val: '-1 day' }] });
    expect(screen.getByDisplayValue('-1 day')).toBeInTheDocument();
  });
});

describe('normaliseTerms', () => {
  it('strips cnj from the first term and defaults later ones to and', () => {
    expect(normaliseTerms([
      { cnj: 'or', attr: 'Id', op: '=', val: '1' },
      { attr: 'Id', op: '=', val: '2' },
      { cnj: 'or', attr: 'Id', op: '=', val: '3' },
    ])).toEqual([
      { attr: 'Id', op: '=', val: '1' },
      { cnj: 'and', attr: 'Id', op: '=', val: '2' },
      { cnj: 'or', attr: 'Id', op: '=', val: '3' },
    ]);
  });
});
