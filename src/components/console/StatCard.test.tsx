import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCard } from './StatCard';

describe('StatCard — basic rendering', () => {
  it('renders the label and value', () => {
    render(<StatCard label="Monitors" value={12} />);
    expect(screen.getByText('Monitors')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('renders a string value as-is', () => {
    render(<StatCard label="Status" value="OK" />);
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('renders an icon when supplied', () => {
    render(
      <StatCard label="Active" value={3} icon={<span data-testid="icon-slot">★</span>} />,
    );
    expect(screen.getByTestId('icon-slot')).toBeInTheDocument();
  });
});

describe('StatCard — subtitle', () => {
  it('renders a subtitle when provided', () => {
    render(<StatCard label="CPU" value="42%" subtitle="last 1m avg" />);
    expect(screen.getByText('last 1m avg')).toBeInTheDocument();
  });

  it('does not render the trend block when only a subtitle is set', () => {
    render(<StatCard label="CPU" value="42%" subtitle="last 1m avg" />);
    // Up/down arrows only appear when a trend object is supplied
    expect(screen.queryByText(/↑|↓/)).toBeNull();
  });
});

describe('StatCard — trend', () => {
  it('renders an up-arrow + positive percentage for a positive trend', () => {
    render(
      <StatCard
        label="Events"
        value={1024}
        trend={{ value: 14, label: 'vs yesterday' }}
      />,
    );
    expect(screen.getByText(/↑ 14%/)).toBeInTheDocument();
    expect(screen.getByText('vs yesterday')).toBeInTheDocument();
  });

  it('renders a down-arrow + absolute percentage for a negative trend', () => {
    render(
      <StatCard
        label="Errors"
        value={7}
        trend={{ value: -22, label: 'vs hour' }}
      />,
    );
    expect(screen.getByText(/↓ 22%/)).toBeInTheDocument();
  });
});

describe('StatCard — variants', () => {
  it('applies the cyan variant text class to the value', () => {
    const { container } = render(
      <StatCard label="Cameras" value={4} variant="cyan" />,
    );
    // The 3xl-bold value should pick up the cyan text colour.
    const value = container.querySelector('.text-3xl');
    expect(value?.className).toContain('text-cyan');
  });

  it('renders the decorative blur halo for non-default variants', () => {
    const { container } = render(
      <StatCard label="Heat" value={9} variant="crimson" />,
    );
    expect(container.querySelector('.blur-3xl')).not.toBeNull();
  });

  it('does not render the blur halo for the default variant', () => {
    const { container } = render(
      <StatCard label="Plain" value={1} />,
    );
    expect(container.querySelector('.blur-3xl')).toBeNull();
  });
});
