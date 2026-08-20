import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import type { Monitor } from '@/types';

const page = <T,>(items: T[]) => ({ items, total: items.length, per_page: 500, current_page: 1, last_page: 1 });

/** Lookup tables every render of the editor fetches. */
const server = setupServer(
  http.get('/api/v3/controls', () => HttpResponse.json(page([]))),
  http.get('/api/v3/storage', () => HttpResponse.json(page([
    { id: 1, name: 'Default', path: '/var/cache/zoneminder/events', type: 'local', enabled: 1 },
    { id: 2, name: 'NAS', path: '/mnt/nas', type: 'local', enabled: 1 },
  ]))),
  http.get('/api/v3/servers', () => HttpResponse.json(page([]))),
  http.get('/api/v3/manufacturers', () => HttpResponse.json(page([{ id: 12, name: 'HikVision' }]))),
  http.get('/api/v3/models', () => HttpResponse.json(page([{ id: 7, name: 'DS-2CD2087', manufacturer_id: 12 }]))),
  http.get('/api/v3/control_presets', () => HttpResponse.json(page([{ monitor_id: 1, preset: 3, label: 'Gate' }]))),
  http.get('/api/v3/monitors', () => HttpResponse.json(page([{ id: 1, name: 'Front Door' }, { id: 2, name: 'Driveway' }]))),
  http.get('/api/v3/groups', () => HttpResponse.json(page([{ id: 1, name: 'Front Yard', parent_id: null }, { id: 2, name: 'Back', parent_id: null }]))),
  http.get('/api/v3/groups-monitors', () => HttpResponse.json(page([{ id: 55, group_id: 1, monitor_id: 1 }]))),
);
beforeAll(() => {
  // A token without a `perms` claim reads as Edit everywhere, so the Save /
  // Delete controls (behind <RequirePerm monitors Edit>) render.
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: { iat: 0, exp: 0, user: 'admin' }, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'bypass' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

// Mock TanStack Router's Link for the same reason as MonitorThumbnail tests.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params, search }: { children: React.ReactNode; to?: string; params?: Record<string, string>; search?: Record<string, unknown> }) => {
    let href = to ?? '#';
    for (const [k, v] of Object.entries(params ?? {})) href = href.replace(`$${k}`, v);
    if (search) href += '?' + new URLSearchParams(search as Record<string, string>).toString();
    return <a href={href}>{children}</a>;
  },
}));

const { MonitorEditor } = await import('./MonitorEditor');

const monitor: Monitor = {
  id: 1,
  name: 'Front Door',
  notes: 'driveway-facing',
  width: 1920,
  height: 1080,
  orientation: 'Rotate0',
  capturing: 'Always',
  analysing: 'Always',
  recording: 'OnMotion',
  function: 'Modect',
  type: 'Ffmpeg',
  host: '192.168.1.10',
  port: '554',
  path: '/Streaming/Channels/101',
  storage_id: 1,
} as unknown as Monitor;

const patchSpy = () => {
  let captured: Record<string, unknown> | null = null;
  server.use(
    http.patch('/api/v3/monitors/1', async ({ request }) => {
      captured = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ...monitor, ...captured });
    }),
  );
  return () => captured;
};

describe('MonitorEditor — diff tracking', () => {
  it('shows "No pending changes" on initial mount', () => {
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    expect(screen.getByText(/no pending changes/i)).toBeInTheDocument();
  });

  it('flips to an "unsaved changes" badge as soon as a field edits', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);

    const nameInput = screen.getByDisplayValue('Front Door');
    await user.tripleClick(nameInput);
    await user.keyboard('Front Door (renamed)');

    expect(screen.getByText(/1 unsaved change/i)).toBeInTheDocument();
    // Save button label echoes the count.
    expect(screen.getByRole('button', { name: /^save 1$/i })).toBeInTheDocument();
  });

  it('shows a per-tab badge for changes in that tab', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);

    const nameInput = screen.getByDisplayValue('Front Door');
    await user.tripleClick(nameInput);
    await user.keyboard('Updated');

    // General tab gets a "1" badge on its left-rail entry.
    const generalTab = screen.getByRole('button', { name: /general/i });
    expect(generalTab.textContent).toContain('1');
  });

  it('Reset clears all pending changes back to baseline', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);

    const nameInput = screen.getByDisplayValue('Front Door');
    await user.tripleClick(nameInput);
    await user.keyboard('Renamed');

    expect(screen.getByText(/1 unsaved change/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /reset/i }));
    expect(screen.getByText(/no pending changes/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Front Door')).toBeInTheDocument();
  });
});

describe('MonitorEditor — save', () => {
  it('PATCHes only changed keys, not the whole monitor', async () => {
    const user = userEvent.setup();
    const captured = patchSpy();

    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    const nameInput = screen.getByDisplayValue('Front Door');
    await user.tripleClick(nameInput);
    await user.keyboard('New Name');

    await user.click(screen.getByRole('button', { name: /^save 1$/i }));

    // PATCH body must contain ONLY the changed field, not the rest.
    await waitFor(() => expect(captured()).toEqual({ name: 'New Name' }));
  });

  it('"Save and close" PATCHes and then calls onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const captured = patchSpy();

    renderWithProviders(<MonitorEditor monitor={monitor} onClose={onClose} />);
    await user.tripleClick(screen.getByDisplayValue('Front Door'));
    await user.keyboard('Renamed');
    await user.click(screen.getByRole('button', { name: /save and close/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(captured()).toEqual({ name: 'Renamed' });
  });

  it('refuses to save an empty name and points at the field instead of PATCHing', async () => {
    const user = userEvent.setup();
    const captured = patchSpy();

    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.clear(screen.getByDisplayValue('Front Door'));
    await user.click(screen.getByRole('button', { name: /^save 1$/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/required/i);
    expect(screen.getByText(/fix the highlighted fields/i)).toBeInTheDocument();
    expect(captured()).toBeNull();
  });

  it('flags a zero width on the Source tab and blocks the save', async () => {
    const user = userEvent.setup();
    const captured = patchSpy();

    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^source$/i }));
    const width = screen.getByLabelText('Width (px)');
    await user.clear(width);
    await user.type(width, '0');
    await user.click(screen.getByRole('button', { name: /^save 1$/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/at least 1/i);
    expect(captured()).toBeNull();
    // The rail shows the error count on the tab.
    expect(screen.getByLabelText(/1 invalid field in source/i)).toBeInTheDocument();
  });

  it('maps a backend 422 `details: [[field, message]]` onto the field and jumps to its tab', async () => {
    const user = userEvent.setup();
    server.use(
      http.patch('/api/v3/monitors/1', () => HttpResponse.json({
        kind: 'validation', error_message: 'validation failed', code: 422,
        details: [['name', 'a monitor with this name already exists']],
      }, { status: 422 })),
    );

    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.tripleClick(screen.getByDisplayValue('Front Door'));
    await user.keyboard('Driveway');
    // Leave General so the jump-back is observable.
    await user.click(screen.getByRole('button', { name: /^mqtt$/i }));
    await user.click(screen.getByRole('button', { name: /^save 1$/i }));

    await waitFor(() => expect(screen.getByRole('heading', { name: /^general$/i })).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent(/already exists/i);
  });
});

describe('MonitorEditor — header actions', () => {
  it('links to Watch, Cycle (with monitor_id) and Zones', () => {
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    const nav = screen.getByRole('navigation', { name: /monitor shortcuts/i });
    expect(within(nav).getByRole('link', { name: /watch/i })).toHaveAttribute('href', '/monitors/1');
    expect(within(nav).getByRole('link', { name: /cycle/i })).toHaveAttribute('href', '/cycle?monitor_id=1');
    expect(within(nav).getByRole('link', { name: /zones/i })).toHaveAttribute('href', '/monitors/1/zones');
  });

  it('Delete asks first, then DELETEs and calls onDeleted', async () => {
    const user = userEvent.setup();
    const onDeleted = vi.fn();
    const onClose = vi.fn();
    let deleted = false;
    server.use(http.delete('/api/v3/monitors/1', () => { deleted = true; return new HttpResponse(null, { status: 204 }); }));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithProviders(<MonitorEditor monitor={monitor} onClose={onClose} onDeleted={onDeleted} />);
    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Front Door'));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
    expect(deleted).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('Delete does nothing when the confirm is declined', async () => {
    const user = userEvent.setup();
    let deleted = false;
    server.use(http.delete('/api/v3/monitors/1', () => { deleted = true; return new HttpResponse(null, { status: 204 }); }));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(deleted).toBe(false);
    confirmSpy.mockRestore();
  });

  it('hides Save and Delete from a viewer without Monitors edit', async () => {
    useAuthStore.setState({ user: { iat: 0, exp: 0, user: 'viewer', perms: { monitors: 'View' } } });
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^save/i })).not.toBeInTheDocument();
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    useAuthStore.setState({ user: { iat: 0, exp: 0, user: 'admin' } });
  });
});

describe('MonitorEditor — discard confirmation', () => {
  it('prompts before cancelling with unsaved changes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderWithProviders(<MonitorEditor monitor={monitor} onClose={onClose} />);
    const nameInput = screen.getByDisplayValue('Front Door');
    await user.tripleClick(nameInput);
    await user.keyboard('Renamed');

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled(); // user declined the discard
    confirmSpy.mockRestore();
  });

  it('cancels without prompt when there are no changes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm');

    renderWithProviders(<MonitorEditor monitor={monitor} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
    confirmSpy.mockRestore();
  });
});

describe('MonitorEditor — tab navigation', () => {
  it('switches the form pane to the clicked tab', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);

    // Initially on General — title says "General".
    expect(screen.getByRole('heading', { name: /^general$/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^source$/i }));
    expect(screen.getByRole('heading', { name: /^source$/i })).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------------ */
/*  Source tab swaps widgets on the source type                             */
/* ------------------------------------------------------------------------ */

describe('MonitorEditor — type-dependent Source tab', () => {
  it('FFmpeg shows path / method / decoder and no V4L device fields', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^source$/i }));

    expect(screen.getByText('Source path')).toBeInTheDocument();
    expect(screen.getByText('Decoder')).toBeInTheDocument();
    expect(screen.getByText('Decoder hardware acceleration')).toBeInTheDocument();
    expect(screen.getByText('Target colourspace')).toBeInTheDocument();
    expect(screen.queryByText('Device path')).not.toBeInTheDocument();
    expect(screen.queryByText('Protocol')).not.toBeInTheDocument();
    // The FFmpeg method list is the legacy TCP/UDP one.
    expect(screen.getByRole('option', { name: 'UDP multicast' })).toBeInTheDocument();
  });

  it('Local shows the V4L fields and the V4L2 deinterlace modes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={{ ...monitor, type: 'Local', device: '/dev/video0' }} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^source$/i }));

    expect(screen.getByText('Device path')).toBeInTheDocument();
    expect(screen.getByText('Device channel')).toBeInTheDocument();
    expect(screen.getByText('Capture palette')).toBeInTheDocument();
    expect(screen.getByText('V4L multi-buffer')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /V4L2: progressive/i })).toBeInTheDocument();
    expect(screen.queryByText('Decoder')).not.toBeInTheDocument();
    expect(screen.queryByText('Source path')).not.toBeInTheDocument();
  });

  it('Remote swaps the Method list with the protocol and reveals RTSP describe', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={{ ...monitor, type: 'Remote', protocol: 'http', method: 'simple' }} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^source$/i }));

    expect(screen.getByRole('option', { name: 'JPEG tags' })).toBeInTheDocument();
    expect(screen.queryByText('RTSP describe')).not.toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue('HTTP'), { target: { value: 'rtsp' } });
    expect(screen.getByRole('option', { name: 'RTP/Unicast' })).toBeInTheDocument();
    expect(screen.getByText('RTSP describe')).toBeInTheDocument();
  });

  it('WebSite shows only the URL, size and refresh — no image adjustments', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={{ ...monitor, type: 'WebSite' }} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^source$/i }));

    expect(screen.getByText('Website URL')).toBeInTheDocument();
    expect(screen.getByText('Width (px)')).toBeInTheDocument();
    expect(screen.queryByText('Brightness')).not.toBeInTheDocument();
    expect(screen.queryByText('Orientation')).not.toBeInTheDocument();
  });

  it('changing the type on General swaps the Source widgets', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    fireEvent.change(screen.getByDisplayValue('FFmpeg'), { target: { value: 'Vnc' } });
    await user.click(screen.getByRole('button', { name: /^source$/i }));
    expect(screen.getByText('Host')).toBeInTheDocument();
    expect(screen.queryByText('Decoder')).not.toBeInTheDocument();
  });

  it('resolution preset fills width and height; the aspect lock follows width edits', async () => {
    const user = userEvent.setup();
    const captured = patchSpy();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^source$/i }));

    fireEvent.change(screen.getByLabelText('Resolution preset'), { target: { value: '1280x720' } });
    expect(screen.getByLabelText('Width (px)')).toHaveValue(1280);
    expect(screen.getByLabelText('Height (px)')).toHaveValue(720);

    await user.click(screen.getByLabelText(/preserve aspect ratio/i));
    fireEvent.change(screen.getByLabelText('Width (px)'), { target: { value: '640' } });
    expect(screen.getByLabelText('Height (px)')).toHaveValue(360);

    await user.click(screen.getByRole('button', { name: /^save 2$/i }));
    await waitFor(() => expect(captured()).toEqual({ width: 640, height: 360 }));
  });

  it('image adjustments accept -1 (camera default) but not -2', async () => {
    const user = userEvent.setup();
    const captured = patchSpy();
    renderWithProviders(<MonitorEditor monitor={{ ...monitor, brightness: 50 }} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^source$/i }));

    const brightness = screen.getByDisplayValue('50');
    fireEvent.change(brightness, { target: { value: '-2' } });
    await user.click(screen.getByRole('button', { name: /^save 1$/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/at least -1/i);

    fireEvent.change(brightness, { target: { value: '-1' } });
    await user.click(screen.getByRole('button', { name: /^save 1$/i }));
    await waitFor(() => expect(captured()).toEqual({ brightness: -1 }));
  });
});

/* ------------------------------------------------------------------------ */
/*  Relationship fields                                                     */
/* ------------------------------------------------------------------------ */

describe('MonitorEditor — General relationships', () => {
  it('lists manufacturers and creates a new one through "Enter new…"', async () => {
    const user = userEvent.setup();
    let posted: Record<string, unknown> | null = null;
    server.use(http.post('/api/v3/manufacturers', async ({ request }) => {
      posted = await request.json() as Record<string, unknown>;
      return HttpResponse.json({ id: 99, name: posted.name });
    }));
    const captured = patchSpy();

    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    const manufacturer = await screen.findByRole('option', { name: 'HikVision' });
    const select = manufacturer.closest('select')!;
    fireEvent.change(select, { target: { value: '__new__' } });
    await user.type(screen.getByLabelText(/new entry name/i), 'Reolink');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => expect(posted).toEqual({ name: 'Reolink' }));
    await waitFor(() => expect(screen.getByText(/1 unsaved change/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^save 1$/i }));
    await waitFor(() => expect(captured()).toEqual({ manufacturer_id: 99 }));
  });

  it('Storage area is a select from /storage and PATCHes the numeric id', async () => {
    const user = userEvent.setup();
    const captured = patchSpy();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^recording$/i }));

    const nas = await screen.findByRole('option', { name: /NAS/ });
    fireEvent.change(nas.closest('select')!, { target: { value: '2' } });
    await user.click(screen.getByRole('button', { name: /^save 1$/i }));
    await waitFor(() => expect(captured()).toEqual({ storage_id: 2 }));
  });

  it('Linked monitors writes a comma-separated id list and never lists the monitor itself', async () => {
    const user = userEvent.setup();
    const captured = patchSpy();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);

    const driveway = await screen.findByLabelText(/Driveway/);
    expect(screen.queryByLabelText(/^1\s*Front Door$/)).not.toBeInTheDocument();
    await user.click(driveway);
    await user.click(screen.getByRole('button', { name: /^save 1$/i }));
    await waitFor(() => expect(captured()).toEqual({ linked_monitors: '2' }));
  });

  it('Return location lists saved PTZ presets after None / Home', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={{ ...monitor, return_location: 3 }} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^control$/i }));
    const preset = await screen.findByRole('option', { name: /Preset 3: Gate/ });
    expect((preset.closest('select') as HTMLSelectElement).value).toBe('3');
    expect(screen.getByRole('link', { name: /list/i })).toHaveAttribute('href', '/settings/ptz-controls');
  });

  it('group membership diffs into attach + detach calls on save', async () => {
    const user = userEvent.setup();
    const attached: unknown[] = [];
    const detached: string[] = [];
    server.use(
      http.post('/api/v3/groups-monitors', async ({ request }) => {
        attached.push(await request.json());
        return HttpResponse.json({ id: 77, group_id: 2, monitor_id: 1 });
      }),
      http.delete('/api/v3/groups-monitors/:id', ({ params }) => {
        detached.push(String(params.id));
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    const frontYard = await screen.findByLabelText('Front Yard');
    expect(frontYard).toBeChecked();
    await user.click(frontYard);
    await user.click(screen.getByLabelText('Back'));
    expect(screen.getByText(/1 unsaved change/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^save 1$/i }));
    await waitFor(() => expect(attached).toEqual([{ group_id: 2, monitor_id: 1 }]));
    expect(detached).toEqual(['55']);
    await waitFor(() => expect(screen.getByText(/no pending changes/i)).toBeInTheDocument());
  });
});

/* ------------------------------------------------------------------------ */
/*  Live-shaped record: raw DB enum casing                                  */
/* ------------------------------------------------------------------------ */

describe('MonitorEditor — record as the API returns it', () => {
  // Copied from GET /monitors/1 on the dev box: the response echoes the DB
  // strings (ROTATE_90, system, auto, WebRTC) while the request enums want
  // Rotate90 / System / Auto / WebRtc.
  const live = {
    ...monitor,
    orientation: 'ROTATE_90',
    event_close_mode: 'system',
    default_codec: 'auto',
    rtsp2_web_type: 'WebRTC',
    output_container: null,
    method: 'rtpRtsp',
    pass: 'hunter2',
    save_jpe_gs: 3,
    restream: 0,
    video_writer: 2,
    label_size: 2,
    default_rate: 100,
    default_scale: '0',
    web_colour: '#6f5873',
  } as unknown as Monitor;

  it('starts clean and shows the stored Orientation, Method, Save JPEGs, Video writer and Default scale', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={live} onClose={() => {}} />);
    expect(screen.getByText(/no pending changes/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^source$/i }));
    expect((screen.getByDisplayValue('Rotate right (90°)') as HTMLSelectElement).value).toBe('Rotate90');
    expect((screen.getByDisplayValue('TCP') as HTMLSelectElement).value).toBe('rtpRtsp');
    const pass = screen.getByDisplayValue('hunter2') as HTMLInputElement;
    expect(pass.type).toBe('password');

    await user.click(screen.getByRole('button', { name: /^recording$/i }));
    expect((screen.getByDisplayValue('System') as HTMLSelectElement).value).toBe('System');
    expect((screen.getByDisplayValue('Frames + Analysis images') as HTMLSelectElement).value).toBe('3');
    expect((screen.getByDisplayValue('Camera passthrough') as HTMLSelectElement).value).toBe('2');

    await user.click(screen.getByRole('button', { name: /^viewing$/i }));
    expect((screen.getByDisplayValue('WebRTC') as HTMLSelectElement).value).toBe('WebRtc');
    expect((screen.getByDisplayValue('1x') as HTMLSelectElement).value).toBe('100');
    // Default scale "Auto" is stored as '0'; Default event view "Auto" is the enum member.
    const autos = screen.getAllByDisplayValue('Auto') as HTMLSelectElement[];
    expect(autos.map((s) => s.value).sort()).toEqual(['0', 'Auto']);

    await user.click(screen.getByRole('button', { name: /^timestamp$/i }));
    expect((screen.getByDisplayValue('Default') as HTMLSelectElement).value).toBe('2');
  });

  it('PATCHes only the changed key, in request casing', async () => {
    const captured = patchSpy();
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={live} onClose={() => {}} />);

    await user.click(screen.getByRole('button', { name: /^source$/i }));
    fireEvent.change(screen.getByDisplayValue('Rotate right (90°)'), { target: { value: 'Rotate180' } });
    await user.click(screen.getByRole('button', { name: /^recording$/i }));
    fireEvent.change(screen.getByDisplayValue('Frames + Analysis images'), { target: { value: '1' } });
    await user.click(screen.getByRole('button', { name: /^save 2$/i }));

    await waitFor(() => expect(captured()).toEqual({ orientation: 'Rotate180', save_jpe_gs: 1 }));
  });

  it('keeps a stored value that is not in the legacy list selectable', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={{ ...live, default_scale: '75' }} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^viewing$/i }));
    expect((screen.getByDisplayValue('75') as HTMLSelectElement).value).toBe('75');
    expect(screen.getByText(/no pending changes/i)).toBeInTheDocument();
  });

  it('Web colour shows a picker and the random button writes a hex colour', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={live} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^misc$/i }));
    // Picker + text box both carry the stored colour.
    expect(screen.getAllByDisplayValue('#6f5873')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: /random colour/i }));
    expect(screen.getByText(/1 unsaved change/i)).toBeInTheDocument();
    const text = screen.getAllByRole('textbox').find((el) => /^#[0-9a-f]{6}$/i.test((el as HTMLInputElement).value));
    expect(text).toBeDefined();
  });
});
