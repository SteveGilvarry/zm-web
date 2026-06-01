import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import type { Monitor } from '@/types';

// Stub TanStack Router's Link to a plain anchor. The real Link expects a
// Router context that's overkill for unit tests; the anchor is functionally
// identical for what these tests check (text content, props).
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={to ?? '#'} {...rest}>
      {children}
    </a>
  ),
}));

// Import AFTER the mock so MonitorThumbnail picks up the stubbed Link.
const { MonitorThumbnail } = await import('./MonitorThumbnail');

// Stub a minimal valid monitor record.
const m: Monitor = {
  id: 1,
  name: 'Front Door',
  width: 1920,
  height: 1080,
  orientation: 'Rotate0',
  capturing: 'Always',
  analysing: 'Always',
  recording: 'OnMotion',
} as unknown as Monitor;

describe('MonitorThumbnail — activity ribbon', () => {
  it('renders the camera name + status dot', () => {
    renderWithProviders(<MonitorThumbnail monitor={m} />);
    expect(screen.getByText('Front Door')).toBeInTheDocument();
  });

  it('shows counter values when counts are supplied', () => {
    renderWithProviders(
      <MonitorThumbnail
        monitor={m}
        counts={{ hour: 4, day: 87, week: 612 }}
      />,
    );
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('87')).toBeInTheDocument();
    expect(screen.getByText('612')).toBeInTheDocument();
  });

  it("shows '··' placeholders when counts are loading", () => {
    renderWithProviders(<MonitorThumbnail monitor={m} />);
    expect(screen.getAllByText('··')).toHaveLength(3);
  });

  it("renders the 'quiet · 24h' sparkline when hourly is all zeros", () => {
    renderWithProviders(
      <MonitorThumbnail monitor={m} hourly={new Array(24).fill(0)} />,
    );
    expect(screen.getByText(/quiet · 24h/i)).toBeInTheDocument();
  });
});
