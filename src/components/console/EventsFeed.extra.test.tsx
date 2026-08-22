/**
 * The relative-time ladder in the feed rolls minutes -> hours -> days, and each
 * thumbnail hides itself when the image 404s. Neither is reached by the main
 * suite, which only ever renders minutes-old events.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ZmEvent } from '@/types';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={to ?? '#'} {...rest}>{children}</a>
  ),
}));

const { EventsFeed } = await import('./EventsFeed');

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

function makeEvent(over: Partial<ZmEvent> = {}): ZmEvent {
  return {
    id: 1, monitor_id: 7, storage_id: 1, name: 'Event-0001', cause: 'Motion',
    start_date_time: ago(5 * 60_000), end_date_time: null,
    width: 1920, height: 1080, length: '95.00', frames: 100, alarm_frames: 12,
    default_video: '', tot_score: 200, avg_score: 12, max_score: 42,
    archived: 0, videoed: 0, uploaded: 0, emailed: 0, messaged: 0, executed: 0,
    notes: null, state_id: 1, orientation: 'Rotate0', disk_space: 0,
    scheme: 'Deep', locked: 0, tags: null, ...over,
  } as ZmEvent;
}

describe('EventsFeed — relative timestamps', () => {
  it('renders "just now" under a minute', () => {
    render(<EventsFeed events={[makeEvent({ start_date_time: ago(20_000) })]} />);
    expect(screen.getByText('just now')).toBeInTheDocument();
  });

  it('renders minutes under an hour', () => {
    render(<EventsFeed events={[makeEvent({ start_date_time: ago(42 * 60_000) })]} />);
    expect(screen.getByText('42m ago')).toBeInTheDocument();
  });

  it('renders hours under a day', () => {
    render(<EventsFeed events={[makeEvent({ start_date_time: ago(5 * 3_600_000) })]} />);
    expect(screen.getByText('5h ago')).toBeInTheDocument();
  });

  it('renders days beyond that', () => {
    render(<EventsFeed events={[makeEvent({ start_date_time: ago(3 * 86_400_000 + 3_600_000) })]} />);
    expect(screen.getByText('3d ago')).toBeInTheDocument();
  });
});

describe('EventsFeed — duration', () => {
  it('formats the decimal-string length the API returns as m:ss', () => {
    render(<EventsFeed events={[makeEvent({ length: '95.00' })]} />);
    expect(screen.getByText('1:35')).toBeInTheDocument();
  });

  it('falls back to a placeholder when the event has no length yet', () => {
    render(<EventsFeed events={[makeEvent({ length: undefined })]} />);
    expect(screen.getByText('--:--')).toBeInTheDocument();
  });
});

describe('EventsFeed — thumbnail loading', () => {
  it('reveals the image once it loads and hides it when it fails', () => {
    render(<EventsFeed events={[makeEvent({ name: 'Front Door' })]} />);
    // The thumbnail is decorative: the row's link already announces the
    // event, so the image carries an empty alt and is found by test id.
    const img = screen.getByTestId('feed-thumb');

    fireEvent.load(img);
    expect(img.style.visibility).toBe('visible');

    fireEvent.error(img);
    expect(img.style.visibility).toBe('hidden');
  });
});
