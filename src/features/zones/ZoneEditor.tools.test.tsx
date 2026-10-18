/**
 * ZoneEditor — the picture's tools: the object-size measurement drawn with
 * the pointer, its ratios and warnings, the still-image stand-in, and the
 * Player select switching what plays behind the polygon.
 */
import { describe, expect, it, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { ZoneEditor } from './ZoneEditor';

vi.mock('@/hooks/useRefreshingSnapshot', () => ({ useRefreshingSnapshot: () => 'blob:snapshot' }));

const stream = vi.hoisted(() => ({ webrtcStart: vi.fn(), hlsStart: vi.fn() }));
vi.mock('@/hooks/useWebRtcStream', () => ({
  useWebRtcStream: () => ({
    videoRef: { current: null }, state: 'idle', error: null, hasAudio: false,
    start: stream.webrtcStart, stop: vi.fn(), pause: vi.fn(),
  }),
}));
vi.mock('@/hooks/useHlsStream', () => ({
  useHlsStream: () => ({
    videoRef: { current: null }, state: 'idle', error: null, hasAudio: false,
    start: stream.hlsStart, stop: vi.fn(), pause: vi.fn(),
  }),
}));

const paged = (items: unknown[]) =>
  HttpResponse.json({ items, total: items.length, per_page: 50, current_page: 1, last_page: 1 });

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  server.use(
    http.get('/api/v3/zone-presets', () => paged([])),
    http.get('/api/v3/monitors/1/zones', () => paged([ZONE])),
  );
  // jsdom has no layout: give the canvas a 1000×500 box at the origin so a
  // client pixel is two capture pixels, and a no-op pointer capture.
  vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500, x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect);
  (Element.prototype as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {};
});
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
  stream.webrtcStart.mockClear();
  stream.hlsStart.mockClear();
  window.localStorage.clear();
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

/** A 1000×500 Blobs zone (500,000 px) in a 2000×1000 frame. */
const ZONE = {
  id: 7, monitor_id: 1, name: 'Yard', type: 'Active', units: 'Pixels',
  coords: '0,0 1000,0 1000,500 0,500', num_coords: 4, area: 500_000,
  check_method: 'AlarmedPixels', alarm_rgb: 0xff0000,
  min_pixel_threshold: 25, max_pixel_threshold: null,
  min_alarm_pixels: 100, max_alarm_pixels: 9000,
  filter_x: 5, filter_y: 5,
  min_filter_pixels: null, max_filter_pixels: null,
  min_blob_pixels: null, max_blob_pixels: null,
  min_blobs: null, max_blobs: null,
  overload_frames: 0, extend_alarm_frames: 0,
};

async function openYard(user: ReturnType<typeof userEvent.setup>, props: { defaultPlayer?: string } = {}) {
  renderWithProviders(<ZoneEditor monitorId={1} width={2000} height={1000} {...props} />);
  await user.click(await screen.findByText('Yard'));
  await screen.findByLabelText('Check Method');
}

const measureButton = () => screen.getByRole('button', { name: 'Measure object' });

function drag(from: [number, number], to: [number, number]) {
  const canvas = screen.getByTestId('zone-canvas');
  fireEvent.pointerDown(canvas, { clientX: from[0], clientY: from[1], button: 0, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: to[0], clientY: to[1], pointerId: 1 });
  fireEvent.pointerUp(canvas, { clientX: to[0], clientY: to[1], pointerId: 1 });
}

describe('ZoneEditor — object size by dragging', () => {
  it('derives Blobs thresholds from a box drawn on the picture', async () => {
    const user = userEvent.setup();
    await openYard(user);
    await user.click(measureButton());
    expect(measureButton()).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'Rectangle measurement' })).toBeInTheDocument();

    // 50×40 client px = 100×80 capture px = 8,000 px.
    drag([100, 100], [150, 140]);

    expect(screen.getByLabelText('Check Method')).toHaveValue('Blobs');
    expect(screen.getByLabelText('Min/Max Alarmed Area (min) (px)')).toHaveValue(2000);
    expect(screen.getByLabelText('Min/Max Alarmed Area (max) (px)')).toHaveValue(null);
    expect(screen.getByLabelText('Min/Max Filtered Area (min) (px)')).toHaveValue(1400);
    expect(screen.getByLabelText('Min/Max Blob Area (min) (px)')).toHaveValue(1204);
    expect(screen.getByLabelText('Min/Max Blobs (min)')).toHaveValue(1);
    // A threshold and filter the operator already set are kept.
    expect(screen.getByLabelText('Min/Max Pixel Threshold (min)')).toHaveValue(25);
    expect(screen.getByLabelText('Filter width')).toHaveValue(5);
    // The typed size follows the drawn box.
    expect(screen.getByLabelText('Object width in pixels')).toHaveValue(100);
    expect(screen.getByLabelText('Object height in pixels')).toHaveValue(80);
    expect(screen.getByTestId('zone-measure-box')).toHaveTextContent('100×80 = 8,000 px');
    // Nothing moved the polygon.
    expect(screen.getByLabelText('Point 3 X')).toHaveValue(1000);
  });

  it('re-derives from the drawn box when a ratio changes', async () => {
    const user = userEvent.setup();
    await openYard(user);
    await user.click(measureButton());
    drag([100, 100], [150, 140]);

    const fraction = screen.getByLabelText('Alarmed area');
    await user.clear(fraction);
    await user.type(fraction, '50');
    await user.tab();
    expect(screen.getByLabelText('Min/Max Alarmed Area (min) (px)')).toHaveValue(4000);
    expect(window.localStorage.getItem('zmZoneObjectFraction')).toBe('50');
  });

  it('warns when the object is narrower than the filter, which would erase it', async () => {
    const user = userEvent.setup();
    await openYard(user);
    await user.click(measureButton());
    // 2×40 client px = 4×80 capture px, under the 5×5 filter.
    drag([100, 100], [102, 140]);
    expect(screen.getByRole('alert')).toHaveTextContent('narrower than the 5x5 filter');
  });

  it('Undo puts back what was there before the measurement', async () => {
    const user = userEvent.setup();
    await openYard(user);
    await user.click(measureButton());
    drag([100, 100], [150, 140]);
    await user.click(screen.getByRole('button', { name: 'Undo measurement' }));

    expect(screen.getByLabelText('Check Method')).toHaveValue('AlarmedPixels');
    expect(screen.getByLabelText('Min/Max Alarmed Area (min) (px)')).toHaveValue(100);
    expect(screen.getByLabelText('Min/Max Alarmed Area (max) (px)')).toHaveValue(9000);
    expect(screen.queryByRole('button', { name: 'Undo measurement' })).toBeNull();
  });

  it('Reset drops the measurement along with the edits', async () => {
    const user = userEvent.setup();
    await openYard(user);
    await user.click(measureButton());
    drag([100, 100], [150, 140]);
    await user.click(screen.getByRole('button', { name: 'Reset' }));

    expect(screen.getByLabelText('Min/Max Alarmed Area (min) (px)')).toHaveValue(100);
    expect(screen.queryByTestId('zone-measure-box')).toBeNull();
    expect(measureButton()).toHaveAttribute('aria-pressed', 'false');
  });

  it('asks for a size before Apply will measure', async () => {
    const user = userEvent.setup();
    await openYard(user);
    await user.click(measureButton());
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the width and height of the object in pixels first');
  });

  it('leaves the vertices alone while not measuring', async () => {
    const user = userEvent.setup();
    await openYard(user);
    drag([100, 100], [150, 140]);
    expect(screen.queryByTestId('zone-measure-box')).toBeNull();
    expect(screen.getByLabelText('Check Method')).toHaveValue('AlarmedPixels');
  });
});

describe('ZoneEditor — still image', () => {
  it('rejects a file that is not an image', async () => {
    const user = userEvent.setup({ applyAccept: false });
    await openYard(user);
    const input = screen.getByTestId('zone-still-file');
    await user.upload(input, new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    expect(screen.getByRole('alert')).toHaveTextContent('That file could not be read as an image');
  });

  it('shows a loaded image in place of the live view, and toggles back', async () => {
    const OrigImage = window.Image;
    // jsdom never decodes images; let the probe succeed.
    class DecodingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) { queueMicrotask(() => this.onload?.()); }
    }
    window.Image = DecodingImage as unknown as typeof Image;
    try {
      const user = userEvent.setup();
      await openYard(user);
      await user.upload(screen.getByTestId('zone-still-file'), new File(['png'], 'car.png', { type: 'image/png' }));
      await waitFor(() => expect(screen.getByTestId('zone-still')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: 'Live view' }));
      expect(screen.queryByTestId('zone-still')).toBeNull();
      expect(screen.getByAltText('Monitor snapshot')).toBeInTheDocument();
    } finally {
      window.Image = OrigImage;
    }
  });
});

describe('ZoneEditor — Player', () => {
  it('plays stills by default and starts WebRTC once chosen', async () => {
    const user = userEvent.setup();
    await openYard(user);
    expect(screen.getByAltText('Monitor snapshot')).toBeInTheDocument();
    expect(stream.webrtcStart).not.toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText('Player'), 'webrtc');
    expect(screen.getByTestId('zone-video-webrtc')).toBeInTheDocument();
    expect(stream.webrtcStart).toHaveBeenCalled();
    expect(stream.hlsStart).not.toHaveBeenCalled();
  });

  it('draws a rotated camera\'s snapshot as it comes: ZoneMinder already turned it', async () => {
    const user = userEvent.setup();
    // A 2000×1000 sensor on ROTATE_90: the view frame is 1000×2000 and the
    // JPEG zm-api serves is portrait already (measured on the box: 2160×3840).
    renderWithProviders(<ZoneEditor monitorId={1} width={1000} height={2000} orientation="ROTATE_90" />);
    await user.click(await screen.findByText('Yard'));
    const img = await screen.findByAltText('Monitor snapshot');
    expect(img.style.transform).toBe('');
    expect(img).toHaveClass('w-full', 'h-full');
  });

  it('leaves a flipped camera\'s snapshot alone too', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ZoneEditor monitorId={1} width={2000} height={1000} orientation="FLIP_HORI" />);
    await user.click(await screen.findByText('Yard'));
    const img = await screen.findByAltText('Monitor snapshot');
    expect(img.style.transform).toBe('');
    expect(img).toHaveClass('w-full', 'h-full');
  });

  it('follows the monitor\'s Default Player on Auto', async () => {
    const user = userEvent.setup();
    await openYard(user, { defaultPlayer: 'go2rtc_hls' });
    expect(screen.getByTestId('zone-video-hls')).toBeInTheDocument();
    expect(stream.hlsStart).toHaveBeenCalled();
  });
});
