import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ZmEvent } from '@/types';

// TanStack Router's Link expects a router context; stub it to a plain anchor
// so EventsFeed renders standalone in tests.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={to ?? '#'} {...rest}>
      {children}
    </a>
  ),
}));

const { EventsFeed } = await import('./EventsFeed');

function makeEvent(over: Partial<ZmEvent> = {}): ZmEvent {
  return {
    id: 1,
    monitor_id: 7,
    storage_id: 1,
    name: 'Event-0001',
    cause: 'Motion',
    start_date_time: new Date(Date.now() - 5 * 60_000).toISOString(),
    end_date_time: null,
    width: 1920,
    height: 1080,
    length: 95,
    frames: 100,
    alarm_frames: 12,
    default_video: '',
    tot_score: 200,
    avg_score: 12,
    max_score: 42,
    archived: 0,
    videoed: 0,
    uploaded: 0,
    emailed: 0,
    messaged: 0,
    executed: 0,
    notes: null,
    state_id: 1,
    orientation: 'Rotate0',
    disk_space: 0,
    scheme: 'Deep',
    locked: 0,
    tags: null,
    ...over,
  } as ZmEvent;
}

describe('EventsFeed — loading state', () => {
  it('renders 5 skeleton rows while isLoading is true', () => {
    const { container } = render(<EventsFeed events={[]} isLoading />);
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(5);
  });
});

describe('EventsFeed — empty state', () => {
  it('shows the "No recent events" hint when no events are passed', () => {
    render(<EventsFeed events={[]} />);
    expect(screen.getByText(/no recent events/i)).toBeInTheDocument();
  });
});

describe('EventsFeed — populated', () => {
  it('renders one row per event with the name shown', () => {
    const events = [
      makeEvent({ id: 1, name: 'Front Door' }),
      makeEvent({ id: 2, name: 'Driveway' }),
    ];
    render(<EventsFeed events={events} />);
    expect(screen.getByText('Front Door')).toBeInTheDocument();
    expect(screen.getByText('Driveway')).toBeInTheDocument();
  });

  it('renders the cause pill when cause is present', () => {
    render(<EventsFeed events={[makeEvent({ cause: 'Alarm' })]} />);
    expect(screen.getByText('Alarm')).toBeInTheDocument();
  });

  it('shows the M{monitor_id} indicator on each row', () => {
    render(<EventsFeed events={[makeEvent({ monitor_id: 7 })]} />);
    expect(screen.getByText('M7')).toBeInTheDocument();
  });

  it('renders the max_score when supplied', () => {
    render(<EventsFeed events={[makeEvent({ max_score: 42 })]} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('formats a 95-second length as 1:35 duration', () => {
    render(<EventsFeed events={[makeEvent({ length: 95 })]} />);
    expect(screen.getByText('1:35')).toBeInTheDocument();
  });

  it('shows "--:--" placeholder when length is 0', () => {
    render(<EventsFeed events={[makeEvent({ length: 0 })]} />);
    expect(screen.getByText('--:--')).toBeInTheDocument();
  });
});
