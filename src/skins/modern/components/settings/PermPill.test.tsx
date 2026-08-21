/**
 * The permission badge used in the user editor's Effective column. Wire
 * values stay English; only the label is translated, and an absent value
 * reads as `None` rather than as a blank pill.
 */
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import { PermPill } from './PermPill';

describe('PermPill', () => {
  it.each(['None', 'View', 'Edit', 'Create'])('labels the %s level', (value) => {
    renderWithProviders(<PermPill value={value} />);
    expect(screen.getByText(value)).toBeInTheDocument();
  });

  it('reads an empty value as None', () => {
    renderWithProviders(<PermPill value="" />);
    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('passes an unrecognised level straight through', () => {
    // `Inherit` reaches the pill from a per-monitor row that has no override.
    renderWithProviders(<PermPill value="Inherit" />);
    expect(screen.getByText('Inherit')).toBeInTheDocument();
  });
});
