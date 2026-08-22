/**
 * The 24-hour sparkline: it only renders when an hourly histogram is supplied,
 * so the main suite never reaches it.
 *
 * NOTE: each bar's hover detail is a bare `<title>` element, which React 19
 * treats as document metadata and hoists into `<head>` — so it never becomes a
 * tooltip on the bar. Asserted where it actually lands; reported upstream.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/render';
import type { Monitor } from '@/types';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={to ?? '#'} {...rest}>{children}</a>
  ),
}));

const { MonitorThumbnail } = await import('./MonitorThumbnail');

const monitor = {
  id: 1, name: 'Front Door', width: 1920, height: 1080, orientation: 'Rotate0',
  capturing: 'Always', analysing: 'Always', recording: 'OnMotion',
} as unknown as Monitor;

/** 24 buckets, newest-first (index 0 = the current hour), peaking at 9. */
const hourly = Array.from({ length: 24 }, (_, i) => {
  if (i === 0) return 2;
  if (i === 3) return 9;
  return i % 3;
});

describe('MonitorThumbnail — 24h sparkline', () => {
  it('labels the histogram with its peak and draws a bar per non-empty hour', () => {
    const { container } = renderWithProviders(
      <MonitorThumbnail monitor={monitor} hourly={hourly} />,
    );
    const chart = screen.getByRole('img', {
      name: '24-hour event activity, peak 9 events per hour',
    });
    // Oldest stays on the left even in RTL — a timeline is physical media.
    expect(chart).toHaveAttribute('dir', 'ltr');
    // 24 bar slots plus the NOW anchor at the right edge.
    expect(chart.children).toHaveLength(25);

    // Each non-empty hour carries its own hover detail as a title attribute
    // (a bare <title> element would be hoisted into <head> by React 19 and
    // never shown).
    const titles = [...container.querySelectorAll('[title]')].map((el) => el.getAttribute('title'));
    expect(titles).toContain('3h ago · 9 events');
    expect(titles).toContain('last hour · 2 events');
    expect(titles.some((x) => x?.includes('NaN'))).toBe(false);
  });

  it('renders a "quiet" baseline instead of 24 ghost bars when nothing happened', () => {
    renderWithProviders(<MonitorThumbnail monitor={monitor} hourly={new Array(24).fill(0)} />);
    expect(screen.getByText('quiet · 24h')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /24-hour event activity/ })).toBeNull();
  });

  it('shows a shimmer while the histogram is still loading', () => {
    renderWithProviders(<MonitorThumbnail monitor={monitor} />);
    expect(screen.queryByRole('img', { name: /24-hour event activity/ })).toBeNull();
    expect(screen.getByLabelText('Loading activity')).toBeInTheDocument();
  });
});
