import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, act } from '@testing-library/react';
import { EventThumbnail } from './EventThumbnail';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('EventThumbnail', () => {
  it('plays the event a quarter of a second after the pointer arrives', () => {
    render(<EventThumbnail eventId={12} token="tok" width={48} animate />);
    const img = screen.getByRole('img', { name: 'Thumbnail for event 12' });

    fireEvent.mouseEnter(img);
    // Legacy waits 250 ms before swapping in the stream (skin.js:1414).
    act(() => { vi.advanceTimersByTime(240); });
    expect(screen.queryByTestId('event-thumb-video-12')).toBeNull();

    act(() => { vi.advanceTimersByTime(20); });
    const video = screen.getByTestId('event-thumb-video-12');
    expect(video).toHaveAttribute('src', expect.stringContaining('/events/12/stream/video.mp4'));

    fireEvent.mouseLeave(video);
    expect(screen.getByRole('img', { name: 'Thumbnail for event 12' })).toBeInTheDocument();
  });

  it('stays a still image when ZM_WEB_ANIMATE_THUMBS is off', () => {
    render(<EventThumbnail eventId={12} width={48} />);
    fireEvent.mouseEnter(screen.getByRole('img', { name: 'Thumbnail for event 12' }));
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByTestId('event-thumb-video-12')).toBeNull();
  });

  it('falls back to the still image when the event has no video', () => {
    render(<EventThumbnail eventId={3} width={48} animate />);
    fireEvent.mouseEnter(screen.getByRole('img', { name: 'Thumbnail for event 3' }));
    act(() => { vi.advanceTimersByTime(300); });
    fireEvent.error(screen.getByTestId('event-thumb-video-3'));
    expect(screen.getByRole('img', { name: 'Thumbnail for event 3' })).toBeInTheDocument();
  });
});
