import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SummaryStrip } from './SummaryStrip';

const noopHandlers = {
  onPickErrors: () => {},
  onPickWarnings: () => {},
  onPickInfo: () => {},
};

describe('SummaryStrip', () => {
  it('renders one card per severity bucket with its count', () => {
    render(
      <SummaryStrip
        summary={{ errors: 3, warnings: 7, info: 42, debug: 0 }}
        total={52}
        shownCount={52}
        page={1}
        pageSize={50}
        activeLevel={undefined}
        {...noopHandlers}
      />,
    );
    expect(screen.getByRole('button', { name: /errors: 3/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /warnings: 7/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^info: 42/i })).toBeInTheDocument();
  });

  it('marks the active card via aria-pressed', () => {
    render(
      <SummaryStrip
        summary={{ errors: 1, warnings: 0, info: 0, debug: 0 }}
        total={1}
        shownCount={1}
        page={1}
        pageSize={50}
        activeLevel={-2}
        {...noopHandlers}
      />,
    );
    // ZoneMinder: -2 is ERROR (-1 is WARNING, 0 INFO).
    expect(screen.getByRole('button', { name: /errors: 1/i }))
      .toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /warnings: 0/i }))
      .toHaveAttribute('aria-pressed', 'false');
  });

  it('calls the matching pick handler when a card is clicked', async () => {
    const user = userEvent.setup();
    const onPickErrors = vi.fn();
    const onPickWarnings = vi.fn();
    const onPickInfo = vi.fn();
    render(
      <SummaryStrip
        summary={{ errors: 1, warnings: 1, info: 1, debug: 0 }}
        total={3}
        shownCount={3}
        page={1}
        pageSize={50}
        activeLevel={undefined}
        onPickErrors={onPickErrors}
        onPickWarnings={onPickWarnings}
        onPickInfo={onPickInfo}
      />,
    );
    await user.click(screen.getByRole('button', { name: /errors: 1/i }));
    expect(onPickErrors).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /warnings: 1/i }));
    expect(onPickWarnings).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /^info: 1/i }));
    expect(onPickInfo).toHaveBeenCalledTimes(1);
  });

  it('computes the "Displaying X–Y" range from page + pageSize + shownCount', () => {
    render(
      <SummaryStrip
        summary={{ errors: 0, warnings: 0, info: 0, debug: 0 }}
        total={500}
        shownCount={50}
        page={3}
        pageSize={50}
        activeLevel={undefined}
        {...noopHandlers}
      />,
    );
    // page 3 of 50/page → 101..150
    expect(screen.getByText(/total: 500/i)).toBeInTheDocument();
    expect(screen.getByText(/101.*150/)).toBeInTheDocument();
  });

  it('offers a Debug card when given a handler and says when counts are page-local', () => {
    render(
      <SummaryStrip
        summary={{ errors: 0, warnings: 0, info: 2, debug: 5 }}
        total={900}
        shownCount={7}
        page={2}
        pageSize={50}
        activeLevel={1}
        {...noopHandlers}
        onPickDebug={() => {}}
        pageLocal
      />,
    );
    expect(screen.getByRole('button', { name: /debug: 5/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/matching on this page: 7/i)).toBeInTheDocument();
  });

  it('shows 0–0 when the table is empty', () => {
    render(
      <SummaryStrip
        summary={{ errors: 0, warnings: 0, info: 0, debug: 0 }}
        total={0}
        shownCount={0}
        page={1}
        pageSize={50}
        activeLevel={undefined}
        {...noopHandlers}
      />,
    );
    expect(screen.getByText(/total: 0/i)).toBeInTheDocument();
    expect(screen.getByText(/0.*0/)).toBeInTheDocument();
  });
});
