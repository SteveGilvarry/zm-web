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

  it('shows counter values when summary is supplied', () => {
    renderWithProviders(
      <MonitorThumbnail
        monitor={m}
        summary={{
          monitor_id: 1,
          hour_events: 4, hour_event_disk_space: 1024,
          day_events: 87, day_event_disk_space: 4096,
          week_events: 612, week_event_disk_space: 8192,
          month_events: 2000, month_event_disk_space: 16384,
          total_events: 5000, total_event_disk_space: 32768,
          archived_events: 25, archived_event_disk_space: 2048,
        }}
      />,
    );
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('87')).toBeInTheDocument();
    expect(screen.getByText('612')).toBeInTheDocument();
  });

  it("shows '··' placeholders when summary is loading", () => {
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

describe('MonitorThumbnail — runtime status', () => {
  const runtime = { monitorId: 1, status: 'NotRunning', captureFps: 0, analysisFps: 0, bandwidth: 0, updatedOn: '' };

  it('colours the lens from the capture-process state, not the config', () => {
    renderWithProviders(<MonitorThumbnail monitor={m} runtime={runtime} />);
    const lens = screen.getByLabelText('NotRunning');
    expect(lens.className).toContain('bg-danger');
  });

  it('shows the capture fps when the status poll has answered', () => {
    renderWithProviders(
      <MonitorThumbnail monitor={m} runtime={{ ...runtime, status: 'Connected', captureFps: 10.89 }} />,
    );
    expect(screen.getByTestId('thumb-fps')).toHaveTextContent('10.9 fps');
    expect(screen.getByLabelText('Connected').className).toContain('bg-ok');
  });

  it('stays grey with no fps before the poll answers', () => {
    renderWithProviders(<MonitorThumbnail monitor={m} />);
    expect(screen.getByLabelText('Capturing').className).toContain('bg-fg-faint');
    expect(screen.queryByTestId('thumb-fps')).toBeNull();
  });
});
