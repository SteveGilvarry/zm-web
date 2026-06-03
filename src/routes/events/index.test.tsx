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
  // Backend /thumbnail renders at the sensor's native (landscape) aspect,
  // so rotated cameras need a CSS rotation to display upright. Container
  // is a square layout footprint (invisible — no bg, no overlay tint);
  // object-contain letterboxes landscape top/bottom and pillarboxes
  // rotated content left/right inside the square.

  it('uses an invisible square layout footprint regardless of orientation', () => {
    const { container } = mount({ orientation: 'Rotate0' });
    const wrapper = container.querySelector('img')!.closest('div')!;
    expect(wrapper.className).toContain('aspect-square');
    expect(wrapper.className).not.toMatch(/bg-(abyss|black|surface)/);
  });

  it('non-rotated event: no transform on the <img>', () => {
    const { container } = mount({ orientation: 'Rotate0' });
    expect(container.querySelector('img')!.style.transform).toBe('');
  });

  it('Rotate90 event: rotate(90deg) on the <img>, no scale', () => {
    const { container } = mount({ orientation: 'Rotate90' });
    const t = container.querySelector('img')!.style.transform;
    expect(t).toContain('rotate(90deg)');
    expect(t).not.toContain('scale(');
  });

  it('Rotate270 event: rotate(270deg)', () => {
    const { container } = mount({ orientation: 'Rotate270' });
    expect(container.querySelector('img')!.style.transform).toContain('rotate(270deg)');
  });

  it('accepts the backend ROTATE_90 string variant', () => {
    const { container } = mount({ orientation: 'ROTATE_90' });
    expect(container.querySelector('img')!.style.transform).toContain('rotate(90deg)');
  });

  it('Rotate180 event: simple rotate(180deg)', () => {
    const { container } = mount({ orientation: 'Rotate180' });
    expect(container.querySelector('img')!.style.transform).toContain('rotate(180deg)');
  });
});
