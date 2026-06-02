import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { RuleBuilder } from './RuleBuilder';
import type { FilterQuery } from '@/api/filters';
import type { Monitor } from '@/types';

const monitors: Monitor[] = [
  { id: 1, name: 'Front Door' } as unknown as Monitor,
  { id: 2, name: 'Driveway' } as unknown as Monitor,
];

describe('RuleBuilder — empty state', () => {
  it("shows the 'No rules yet' hint when there are no rules", () => {
    const q: FilterQuery = { rules: [] };
    renderWithProviders(
      <RuleBuilder query={q} monitors={monitors} onChange={() => {}} />,
    );
    expect(screen.getByText(/no rules yet/i)).toBeInTheDocument();
  });

  it('exposes an "Add rule" button', () => {
    const q: FilterQuery = { rules: [] };
    renderWithProviders(
      <RuleBuilder query={q} monitors={monitors} onChange={() => {}} />,
    );
    expect(screen.getByRole('button', { name: /add rule/i })).toBeInTheDocument();
  });
});

describe('RuleBuilder — add a rule', () => {
  it('clicking Add rule emits a new default rule via onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const q: FilterQuery = { rules: [] };
    renderWithProviders(
      <RuleBuilder query={q} monitors={monitors} onChange={onChange} />,
    );

    await user.click(screen.getByRole('button', { name: /add rule/i }));
    expect(onChange).toHaveBeenCalledOnce();
    const next = onChange.mock.calls[0][0] as FilterQuery;
    expect(next.rules).toHaveLength(1);
    expect(next.rules[0].field).toBe('monitor_id');
    expect(next.rules[0].operator).toBe('=');
    expect(next.rules[0].conjunction).toBe('and');
  });
});

describe('RuleBuilder — existing rules', () => {
  it('renders each rule with its field / operator / value selectors', () => {
    const q: FilterQuery = {
      rules: [
        { field: 'cause',      operator: 'contains', value: 'motion', conjunction: 'and' },
        { field: 'max_score',  operator: '>',        value: '50',     conjunction: 'or' },
      ],
    };
    renderWithProviders(
      <RuleBuilder query={q} monitors={monitors} onChange={() => {}} />,
    );

    // 'where' label appears on the first row only, AND/OR selector on later rows.
    expect(screen.getByText(/^where$/i)).toBeInTheDocument();
    // Two value inputs (one is a text field for cause, one for the score).
    expect(screen.getByDisplayValue('motion')).toBeInTheDocument();
    expect(screen.getByDisplayValue('50')).toBeInTheDocument();
  });

  it('clicking the remove (×) on a rule fires onChange without it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const q: FilterQuery = {
      rules: [
        { field: 'cause', operator: 'contains', value: 'motion', conjunction: 'and' },
        { field: 'max_score', operator: '>', value: '50', conjunction: 'and' },
      ],
    };
    renderWithProviders(
      <RuleBuilder query={q} monitors={monitors} onChange={onChange} />,
    );

    // Two rules → two remove buttons.
    const removeBtns = screen.getAllByRole('button', { name: /remove rule/i });
    expect(removeBtns).toHaveLength(2);

    await user.click(removeBtns[0]);
    const next = onChange.mock.calls[0][0] as FilterQuery;
    expect(next.rules).toHaveLength(1);
    expect(next.rules[0].field).toBe('max_score');
  });
});

describe('RuleBuilder — P19 operator parity', () => {
  it('exposes the full legacy operator set for string fields', () => {
    const q: FilterQuery = {
      rules: [
        { field: 'cause', operator: '=', value: '', conjunction: 'and' },
      ],
    };
    renderWithProviders(
      <RuleBuilder query={q} monitors={monitors} onChange={() => {}} />,
    );

    // The operator dropdown is the second combobox (after field).
    const selects = screen.getAllByRole('combobox');
    const opSelect = selects.find((s) =>
      Array.from(s.querySelectorAll('option')).some((o) => o.textContent === 'LIKE'),
    );
    expect(opSelect).toBeDefined();
    const optionTexts = Array.from(opSelect!.querySelectorAll('option')).map((o) => o.textContent);
    // Spot-check the new legacy tokens added in P19.
    expect(optionTexts).toEqual(expect.arrayContaining([
      '=', '!=', '=~', '!~', '=[]', '![]', 'LIKE', 'NOT LIKE', 'IS', 'IS NOT',
    ]));
  });

  it('exposes >= and <= for numeric fields', () => {
    const q: FilterQuery = {
      rules: [
        { field: 'max_score', operator: '=', value: '', conjunction: 'and' },
      ],
    };
    renderWithProviders(
      <RuleBuilder query={q} monitors={monitors} onChange={() => {}} />,
    );
    const selects = screen.getAllByRole('combobox');
    const opSelect = selects.find((s) =>
      Array.from(s.querySelectorAll('option')).some((o) => o.textContent === '>='),
    );
    expect(opSelect).toBeDefined();
    const optionTexts = Array.from(opSelect!.querySelectorAll('option')).map((o) => o.textContent);
    expect(optionTexts).toEqual(expect.arrayContaining(['>=', '<=', '=[]', '![]']));
  });

  it('renders the restricted value picker for IS / IS NOT', () => {
    const q: FilterQuery = {
      rules: [
        { field: 'notes', operator: 'IS', value: 'NULL', conjunction: 'and' },
      ],
    };
    renderWithProviders(
      <RuleBuilder query={q} monitors={monitors} onChange={() => {}} />,
    );
    expect(screen.getByText(/NULL \(unspecified\)/i)).toBeInTheDocument();
    expect(screen.getByText(/^Zero$/)).toBeInTheDocument();
  });

  it('shows the bracket-open / bracket-close selectors per row', () => {
    const q: FilterQuery = {
      rules: [
        { field: 'cause', operator: '=', value: 'Motion', conjunction: 'and' },
      ],
    };
    renderWithProviders(
      <RuleBuilder query={q} monitors={monitors} onChange={() => {}} />,
    );
    expect(screen.getByLabelText(/open brackets/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/close brackets/i)).toBeInTheDocument();
  });

  it('emits bracket_open via onChange when adjusted', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const q: FilterQuery = {
      rules: [
        { field: 'cause', operator: '=', value: 'Motion', conjunction: 'and', bracket_open: 0, bracket_close: 0 },
      ],
    };
    renderWithProviders(
      <RuleBuilder query={q} monitors={monitors} onChange={onChange} />,
    );
    await user.selectOptions(screen.getByLabelText(/open brackets/i), '2');
    const next = onChange.mock.calls[0][0] as FilterQuery;
    expect(next.rules[0].bracket_open).toBe(2);
  });
});
