/**
 * The frames list's thumbnail cell (legacy `ajax/frames.php:188`).
 */
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useAuthStore } from '@/stores/auth';
import { FrameThumbnail } from './FrameThumbnail';

beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'tok', refreshToken: 'tok', user: null, isAuthenticated: true,
  });
});
afterAll(() => useAuthStore.getState().clearAuth());

describe('FrameThumbnail', () => {
  it('keys the image off the Frames row id, not the frame number', () => {
    render(<FrameThumbnail frameId={2068973} frameNumber={100} token="tok" width={48} />);
    const img = screen.getByTestId('frame-thumb-2068973');
    expect(img).toHaveAttribute('src', '/api/v3/frames/2068973/image?token=tok');
    expect(img).toHaveAttribute('alt', 'Frame 100');
    expect(img).toHaveAttribute('width', '48');
    // Legacy lazily loads a table full of these.
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('falls back to a dash rather than a broken image', async () => {
    render(<FrameThumbnail frameId={5} frameNumber={1} token="tok" width={48} />);
    fireEvent.error(screen.getByTestId('frame-thumb-5'));
    await waitFor(() => expect(screen.queryByTestId('frame-thumb-5')).toBeNull());
    expect(screen.getByTitle('No stored image for this frame.')).toHaveTextContent('—');
  });

  it('omits the token from the URL when there is none', () => {
    render(<FrameThumbnail frameId={5} frameNumber={1} token={null} width={48} />);
    expect(screen.getByTestId('frame-thumb-5')).toHaveAttribute('src', '/api/v3/frames/5/image');
  });
});

describe('FrameThumbnail — hover (ZM_WEB_ANIMATE_THUMBS)', () => {
  it('shows the frame full size after a quarter-second hover, and hides it on leave', () => {
    vi.useFakeTimers();
    try {
      render(<FrameThumbnail frameId={7} frameNumber={3} token="t" width={48} animate />);
      const thumb = screen.getByTestId('frame-thumb-7');
      fireEvent.mouseEnter(thumb.parentElement!);
      expect(screen.queryByTestId('frame-thumb-zoom-7')).toBeNull();
      act(() => { vi.advanceTimersByTime(250); });
      const zoom = screen.getByTestId('frame-thumb-zoom-7');
      expect(zoom).toHaveAttribute('src', thumb.getAttribute('src'));
      expect(zoom.style.width).toBe('384px');

      fireEvent.mouseLeave(thumb.parentElement!);
      expect(screen.queryByTestId('frame-thumb-zoom-7')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stays a plain image when animation is off', () => {
    render(<FrameThumbnail frameId={7} frameNumber={3} width={48} />);
    expect(screen.getByTestId('frame-thumb-7').parentElement?.tagName).not.toBe('SPAN');
  });
});
