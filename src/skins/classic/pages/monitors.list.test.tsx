/**
 * `/monitors` in the classic skin is deliberately the Console: legacy
 * ZoneMinder has no separate monitors page, so this module is an alias.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./console', () => ({
  default: () => <div data-testid="classic-console-page">console</div>,
}));

const { default: ClassicMonitorsListPage } = await import('./monitors.list');

describe('ClassicMonitorsListPage', () => {
  it('renders the Console page', () => {
    render(<ClassicMonitorsListPage />);
    expect(screen.getByTestId('classic-console-page')).toBeInTheDocument();
  });
});
