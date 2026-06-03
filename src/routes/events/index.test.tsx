import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// EventCard uses TanStack Router's <Link>. Mock it to a plain <a> so we
// don't need to construct a full router context for a unit test.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, ...rest }: { children: React.ReactNode; to?: string; params?: Record<string, string> }) => (
    <a href={to && params ? to.replace(/\$\w+/g, (k) => params[k.slice(1)] ?? k) : to ?? '#'} {...rest}>
      {children}
    </a>
  ),
  createFileRoute: () => () => ({ component: () => null }),
  useSearch: () => ({}),
}));

const { EventCard } = await import('./index');

function mount(eventOverrides: Record<string, unknown>) {
  const event = {
    id: 100, monitor_id: 1, name: 'Event 100', cause: 'Motion',
    start_date_time: '2026-06-03T12:00:00Z',
    end_date_time:   '2026-06-03T12:00:30Z',
    width: 1920, height: 1080, length: 30, frames: 100, alarm_frames: 5,
    default_video: '100-video.mp4', tot_score: 0, avg_score: 0, max_score: 0,
    archived: 0, videoed: 1, uploaded: 0, emailed: 0, messaged: 0, executed: 0,
    notes: null, state_id: 1, orientation: 'Rotate0',
    disk_space: 1_048_576, scheme: 'Medium', locked: 0, tags: [],
    storage_id: 1,
    ...eventOverrides,
  };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <EventCard
        event={event as never}
        monitorName="Test Monitor"
        token="test"
        isSelected={false}
        onToggleSelected={() => {}}
      />
    </QueryClientProvider>,
  );
}

describe('EventCard — thumbnail rotation', () => {
  // Regression: backend's /thumbnail endpoint renders at the sensor's
  // native (landscape) aspect, so rotated cameras would display sideways
  // pixels in a 16:9 box. The fix rotates the thumbnail upright AND
  // switches the container to portrait (9:16) so the rotated content
  // fills it instead of being letterboxed.

  it('non-rotated event: 16:9 container, no transform on the <img>', () => {
    const { container } = mount({ orientation: 'Rotate0' });
    const thumb = container.querySelector('img')!;
    expect(thumb.style.transform).toBe('');
    // Container should carry aspect-video.
    const wrapper = thumb.closest('div')!;
    expect(wrapper.className).toContain('aspect-video');
  });

  it('Rotate90 event: portrait container + rotate(90deg) swap-dim transform', () => {
    const { container } = mount({
      orientation: 'Rotate90', width: 1080, height: 1920,
    });
    const thumb = container.querySelector('img')!;
    expect(thumb.style.transform).toContain('rotate(90deg)');
    expect(thumb.style.width).toBe('177.7778%');
    expect(thumb.style.height).toBe('56.25%');
    expect(thumb.style.position).toBe('absolute');
    const wrapper = thumb.closest('div')!;
    expect(wrapper.className).toContain('aspect-[9/16]');
    expect(wrapper.className).not.toContain('aspect-video');
  });

  it('Rotate270 event: same portrait container, 270° rotation', () => {
    const { container } = mount({
      orientation: 'Rotate270', width: 1080, height: 1920,
    });
    const thumb = container.querySelector('img')!;
    expect(thumb.style.transform).toContain('rotate(270deg)');
  });

  it('accepts the backend ROTATE_90 string variant', () => {
    const { container } = mount({
      orientation: 'ROTATE_90', width: 1080, height: 1920,
    });
    const thumb = container.querySelector('img')!;
    expect(thumb.style.transform).toContain('rotate(90deg)');
    const wrapper = thumb.closest('div')!;
    expect(wrapper.className).toContain('aspect-[9/16]');
  });

  it('Rotate180 event: landscape container + simple rotate(180deg), no swap', () => {
    const { container } = mount({ orientation: 'Rotate180' });
    const thumb = container.querySelector('img')!;
    expect(thumb.style.transform).toContain('rotate(180deg)');
    // 180° preserves bounding box; container stays 16:9.
    const wrapper = thumb.closest('div')!;
    expect(wrapper.className).toContain('aspect-video');
    expect(thumb.style.position).toBe('');
  });
});
