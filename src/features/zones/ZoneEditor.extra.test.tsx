/**
 * ZoneEditor — the branches `ZoneEditor.test.tsx` doesn't reach: saving an
 * existing zone (PUT), the per-type hint text, the units no-op, unknown zone
 * types, and the SVG vertex interactions (drag, Alt-click delete,
 * right-click suppression).
 */
import { describe, expect, it, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { ZoneEditor } from './ZoneEditor';
import { useToastStore } from '@/components/common/toastStore';

// The live snapshot poller would hammer the backend; the editor works fine
// with no image behind the polygon.
vi.mock('@/hooks/useRefreshingSnapshot', () => ({ useRefreshingSnapshot: () => null }));

const paged = (items: unknown[]) =>
  HttpResponse.json({ items, total: items.length, per_page: 50, current_page: 1, last_page: 1 });

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  server.use(http.get('/api/v3/zone-presets', () => paged([])));
});
afterEach(() => {
  server.resetHandlers();
  restorePointerCapture();
  useToastStore.getState().clear();
});

/**
 * jsdom implements no pointer-capture API at all, and the editor calls
 * `setPointerCapture` the moment a vertex is grabbed. Install a no-op for
 * the duration of a test.
 */
let undoPointerCapture: (() => void) | null = null;
function stubPointerCapture() {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  const had = Object.prototype.hasOwnProperty.call(proto, 'setPointerCapture');
  const prev = proto.setPointerCapture;
  proto.setPointerCapture = () => {};
  undoPointerCapture = () => {
    if (had) proto.setPointerCapture = prev;
    else delete proto.setPointerCapture;
  };
}
function restorePointerCapture() {
  undoPointerCapture?.();
  undoPointerCapture = null;
}
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

const quad = {
  id: 7, monitor_id: 1, name: 'Driveway', type: 'Active', units: 'Pixels',
  coords: '100,100 500,100 500,400 100,400', num_coords: 4,
  check_method: 'AlarmedPixels', alarm_rgb: 16711680,
  min_pixel_threshold: 25, max_pixel_threshold: null,
  min_alarm_pixels: 100, max_alarm_pixels: null,
  overload_frames: 0, extend_alarm_frames: 0, area: 120000,
};

function stubZones(items: unknown[] = [quad]) {
  server.use(http.get('/api/v3/monitors/1/zones', () => paged(items)));
}

function mount() {
  return renderWithProviders(<ZoneEditor monitorId={1} width={1920} height={1080} />);
}

/** Vertex handles are the `cursor: grab` circles; midpoints use `crosshair`. */
const vertices = (root: HTMLElement) => root.querySelectorAll('circle[style*="grab"]');

describe('ZoneEditor — saving an existing zone', () => {
  it('PUTs /zones/{id} with the name and serialised polygon, then closes the form', async () => {
    const user = userEvent.setup();
    let sent: { url: string; body: unknown } | null = null;
    stubZones();
    server.use(
      http.put('/api/v3/zones/:id', async ({ request, params }) => {
        sent = { url: `/api/v3/zones/${params.id}`, body: await request.json() };
        return HttpResponse.json({ ...quad, name: 'Driveway West' });
      }),
    );
    mount();
    await waitFor(() => screen.getByText('Driveway'));

    await user.click(screen.getByText('Driveway'));
    const nameInput = screen.getByDisplayValue('Driveway');
    await user.clear(nameInput);
    await user.type(nameInput, 'Driveway West');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent!).toEqual({
      url: '/api/v3/zones/7',
      // Name, geometry and every motion setting the zone's type and check
      // method leave enabled. An AlarmedPixels zone has no filter or blob
      // rows, so those keys are absent rather than nulled.
      body: {
        name: 'Driveway West',
        type: 'Active',
        units: 'Pixels',
        coords: '100,100 500,100 500,400 100,400',
        check_method: 'AlarmedPixels',
        alarm_rgb: 16711680,
        min_pixel_threshold: 25,
        max_pixel_threshold: null,
        min_alarm_pixels: 100,
        max_alarm_pixels: null,
        overload_frames: 0,
        // Only a Preclusive zone can set this one (`applyZoneType`).
      },
    });
    // Success clears the draft, so the vertex caption disappears.
    await waitFor(() => expect(screen.queryByText(/4 vertices/i)).toBeNull());
  });

  it('leaves the draft open when the save is rejected', async () => {
    const user = userEvent.setup();
    stubZones();
    server.use(
      http.put('/api/v3/zones/:id', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'Zones table locked' }, { status: 500 })),
    );
    mount();
    await waitFor(() => screen.getByText('Driveway'));

    await user.click(screen.getByText('Driveway'));
    await user.click(screen.getByRole('button', { name: /save/i }));

    // The form is still there with the draft intact.
    await waitFor(() => expect(screen.getByText(/editing #7/i)).toBeInTheDocument());
    expect(screen.getByDisplayValue('Driveway')).toBeInTheDocument();
  });
});

describe('ZoneEditor — type labels and hints', () => {
  it('renders the hint for every known zone type', async () => {
    const user = userEvent.setup();
    stubZones([]);
    mount();
    await waitFor(() => screen.getByText(/no zones yet/i));
    await user.click(screen.getByRole('button', { name: /new/i }));

    const select = screen.getByDisplayValue('Active');
    const expectations: Array<[string, RegExp]> = [
      ['Inclusive', /only counts if it also overlaps an Active zone/i],
      ['Exclusive', /motion in this region is ignored/i],
      ['Preclusive', /the whole frame is rejected/i],
      ['Inactive', /no detection here/i],
    ];
    for (const [type, hint] of expectations) {
      await user.selectOptions(select, type);
      expect(screen.getByText(hint)).toBeInTheDocument();
    }
  });

  it('echoes an unknown zone type back as its own label and shows no hint', async () => {
    const user = userEvent.setup();
    stubZones([{ ...quad, id: 9, name: 'Legacy', type: 'Blobs' }]);
    mount();
    await waitFor(() => screen.getByText('Legacy'));

    // The list badge falls back to the raw wire value.
    expect(screen.getByText('Blobs')).toBeInTheDocument();

    await user.click(screen.getByText('Legacy'));
    expect(screen.getByText(/editing #9/i)).toBeInTheDocument();
    // None of the six known hints is on screen.
    expect(screen.queryByText(/triggers alarms on motion/i)).toBeNull();
    expect(screen.queryByText(/region is blacked out/i)).toBeNull();
  });
});

describe('ZoneEditor — units toggle no-op', () => {
  it('clicking the already-active unit changes nothing', async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> = {};
    stubZones([]);
    server.use(http.post('/api/v3/monitors/1/zones', async ({ request }) => {
      body = await request.json() as Record<string, unknown>;
      return HttpResponse.json({ id: 99 });
    }));
    mount();
    await waitFor(() => screen.getByText(/no zones yet/i));

    await user.click(screen.getByRole('button', { name: /new/i }));
    // Pixels is already the draft's units — clicking it is an early return.
    await user.click(screen.getByRole('button', { name: 'Pixels' }));
    await user.click(screen.getByRole('button', { name: 'Pixels' }));
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(body.units).toBe('Pixels'));
    expect(body.coords).toBe('384,216 1536,216 1536,864 384,864');
  });
});

describe('ZoneEditor — vertex handles', () => {
  it('drags a vertex to a new position and writes it into the saved polygon', async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> = {};
    stubZones();
    server.use(http.put('/api/v3/zones/:id', async ({ request }) => {
      body = await request.json() as Record<string, unknown>;
      return HttpResponse.json(quad);
    }));
    // jsdom gives every element a zero-sized rect; the drag maths needs a real one.
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 960, bottom: 540, width: 960, height: 540,
      toJSON: () => ({}),
    } as DOMRect);
    stubPointerCapture();

    const { container } = mount();
    await waitFor(() => screen.getByText('Driveway'));
    await user.click(screen.getByText('Driveway'));
    await waitFor(() => screen.getByText(/4 vertices/i));

    const handles = vertices(container);
    expect(handles).toHaveLength(4);

    // Grab the first vertex and move it: the rect is half-scale, so a pointer
    // at (400, 250) maps to (800, 500) in the monitor's native pixel space.
    fireEvent.pointerDown(handles[0], { pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent(window, new MouseEvent('pointermove', { clientX: 400, clientY: 250, bubbles: true }));
    fireEvent(window, new MouseEvent('pointerup', { bubbles: true }));

    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(body.coords).toBeDefined());
    expect(body.coords).toBe('800,500 500,100 500,400 100,400');
  });

  it('clamps a drag that leaves the frame to the frame bounds', async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> = {};
    stubZones();
    server.use(http.put('/api/v3/zones/:id', async ({ request }) => {
      body = await request.json() as Record<string, unknown>;
      return HttpResponse.json(quad);
    }));
    vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 960, bottom: 540, width: 960, height: 540,
      toJSON: () => ({}),
    } as DOMRect);
    stubPointerCapture();

    const { container } = mount();
    await waitFor(() => screen.getByText('Driveway'));
    await user.click(screen.getByText('Driveway'));
    await waitFor(() => screen.getByText(/4 vertices/i));

    fireEvent.pointerDown(vertices(container)[0], { pointerId: 1, clientX: 50, clientY: 50 });
    fireEvent(window, new MouseEvent('pointermove', { clientX: -500, clientY: -500, bubbles: true }));
    fireEvent(window, new MouseEvent('pointermove', { clientX: 9999, clientY: 9999, bubbles: true }));
    fireEvent(window, new MouseEvent('pointerup', { bubbles: true }));

    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(body.coords).toBeDefined());
    expect(body.coords).toBe('1920,1080 500,100 500,400 100,400');
  });

  it('Alt-clicking a vertex removes it, but never below three', async () => {
    const user = userEvent.setup();
    stubZones();
    stubPointerCapture();
    const { container } = mount();
    await waitFor(() => screen.getByText('Driveway'));
    await user.click(screen.getByText('Driveway'));
    await waitFor(() => screen.getByText(/4 vertices/i));

    fireEvent.pointerDown(vertices(container)[1], { pointerId: 1, altKey: true });
    await waitFor(() => expect(screen.getByText(/3 vertices/i)).toBeInTheDocument());

    // A triangle is the floor — Alt-click is ignored and falls through to drag.
    fireEvent.pointerDown(vertices(container)[0], { pointerId: 1, altKey: true });
    fireEvent(window, new MouseEvent('pointerup', { bubbles: true }));
    expect(screen.getByText(/3 vertices/i)).toBeInTheDocument();
  });

  it('suppresses the browser context menu on a vertex', async () => {
    const user = userEvent.setup();
    stubZones();
    const { container } = mount();
    await waitFor(() => screen.getByText('Driveway'));
    await user.click(screen.getByText('Driveway'));
    await waitFor(() => screen.getByText(/4 vertices/i));

    const handled = fireEvent.contextMenu(vertices(container)[0]);
    // fireEvent returns false once a listener called preventDefault().
    expect(handled).toBe(false);
  });
});

describe('ZoneEditor — the point table, the intersection guard and Privacy', () => {
  it('lists every vertex, and typing a coordinate moves it', async () => {
    const user = userEvent.setup();
    stubZones();
    mount();
    await waitFor(() => screen.getByText('Driveway'));
    await user.click(screen.getByText('Driveway'));
    await waitFor(() => screen.getByText(/4 vertices/i));

    const x1 = screen.getByLabelText('Point 1 X');
    expect(x1).toHaveValue(100);
    expect(screen.getByLabelText('Point 3 Y')).toHaveValue(400);

    await user.clear(x1);
    await user.type(x1, '250');
    expect(screen.getByLabelText('Point 1 X')).toHaveValue(250);
  });

  it('clamps a coordinate typed past the frame', async () => {
    const user = userEvent.setup();
    stubZones();
    mount();
    await waitFor(() => screen.getByText('Driveway'));
    await user.click(screen.getByText('Driveway'));
    await waitFor(() => screen.getByText(/4 vertices/i));

    const y1 = screen.getByLabelText('Point 1 Y');
    await user.clear(y1);
    await user.type(y1, '5000');
    // The frame is 1920×1080, so Y stops at 1080.
    expect(screen.getByLabelText('Point 1 Y')).toHaveValue(1080);
  });

  it('+ inserts the midpoint to the next vertex and − removes one, down to a triangle', async () => {
    const user = userEvent.setup();
    stubZones();
    mount();
    await waitFor(() => screen.getByText('Driveway'));
    await user.click(screen.getByText('Driveway'));
    await waitFor(() => screen.getByText(/4 vertices/i));

    await user.click(screen.getByRole('button', { name: 'Add a point after point 1' }));
    await waitFor(() => screen.getByText(/5 vertices/i));
    // Midpoint of (100,100) and (500,100).
    expect(screen.getByLabelText('Point 2 X')).toHaveValue(300);
    expect(screen.getByLabelText('Point 2 Y')).toHaveValue(100);

    await user.click(screen.getByRole('button', { name: 'Remove point 2' }));
    await waitFor(() => screen.getByText(/4 vertices/i));
    await user.click(screen.getByRole('button', { name: 'Remove point 2' }));
    await waitFor(() => screen.getByText(/3 vertices/i));
    expect(screen.getByRole('button', { name: 'Remove point 1' })).toBeDisabled();
  });

  it('blocks Save while the edges cross, and says why', async () => {
    const user = userEvent.setup();
    stubZones();
    mount();
    await waitFor(() => screen.getByText('Driveway'));
    await user.click(screen.getByText('Driveway'));
    await waitFor(() => screen.getByText(/4 vertices/i));
    expect(screen.getByRole('button', { name: /save/i })).toBeEnabled();

    // Swap the last two vertices into a bow tie.
    const y3 = screen.getByLabelText('Point 3 Y');
    await user.clear(y3);
    await user.type(y3, '100');
    const y4 = screen.getByLabelText('Point 4 Y');
    await user.clear(y4);
    await user.type(y4, '400');
    const x4 = screen.getByLabelText('Point 4 X');
    await user.clear(x4);
    await user.type(x4, '500');

    expect(await screen.findByRole('alert')).toHaveTextContent('Polygon edges must not intersect');
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('warns that the capture process restarts after saving a Privacy zone', async () => {
    const user = userEvent.setup();
    stubZones([{ ...quad, type: 'Privacy' }]);
    server.use(http.put('/api/v3/zones/:id', () => HttpResponse.json({ ...quad, type: 'Privacy' })));
    mount();
    await waitFor(() => screen.getByText('Driveway'));
    await user.click(screen.getByText('Driveway'));
    await waitFor(() => screen.getByText(/4 vertices/i));

    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((x) => /capture process/i.test(x.message))).toBe(true));
  });

  it('says nothing extra after saving a non-Privacy zone', async () => {
    const user = userEvent.setup();
    stubZones();
    server.use(http.put('/api/v3/zones/:id', () => HttpResponse.json(quad)));
    mount();
    await waitFor(() => screen.getByText('Driveway'));
    await user.click(screen.getByText('Driveway'));
    await waitFor(() => screen.getByText(/4 vertices/i));

    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(screen.queryByText(/4 vertices/i)).toBeNull());
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
