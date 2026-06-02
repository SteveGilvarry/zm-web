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
