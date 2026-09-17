/**
 * The frames list's thumbnail cell (legacy `ajax/frames.php:188`).
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
