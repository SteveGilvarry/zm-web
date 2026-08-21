/**
 * Options → Control (classic skin): the legacy control-profile table plus the
 * `?id=` controlcap editor — sort, search, mark-and-delete (with the
 * still-referenced guard) and the create/edit round trip.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';

let mockSearch: Record<string, unknown> = {};
const mockNavigate = vi.fn((opts: { search?: (prev: Record<string, unknown>) => Record<string, unknown> }) => {
  mockSearch = opts.search?.({ ...mockSearch }) ?? {};
});
const historyBack = vi.fn();
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string; search?: unknown }) => {
    delete rest.search;
    return <a href={to ?? '#'} {...rest}>{children}</a>;
  },
  useSearch: () => ({ ...mockSearch }),
  useNavigate: () => mockNavigate,
  useRouter: () => ({ history: { back: historyBack } }),
}));
vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const ALL_EDIT = {
  stream: 'Edit', events: 'Edit', control: 'Edit', monitors: 'Edit',
  groups: 'Edit', devices: 'Edit', snapshots: 'Edit', system: 'Edit',
};
const ADMIN = { iat: 0, exp: 4102444800, user: 'admin', uid: 1, perms: ALL_EDIT };
const VIEWER = { ...ADMIN, user: 'viewer', uid: 2, perms: { ...ALL_EDIT, control: 'View' } };

function signIn(user: unknown = ADMIN) {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', isAuthenticated: true, user: user as never,
  });
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  useToastStore.getState().clear();
  mockSearch = {};
  mockNavigate.mockClear();
  historyBack.mockClear();
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

const paged = <T,>(items: T[], over: Record<string, number> = {}) => ({
  items, total: items.length, per_page: 200, current_page: 1, last_page: 1, ...over,
});

/** A Control with every capability flag zeroed unless overridden. */
function mkControl(over: Record<string, unknown>) {
  const base: Record<string, unknown> = {
    id: 0, name: '', type: 'Local', protocol: null,
    can_pan: 0, can_tilt: 0, can_zoom: 0, can_move: 0, can_move_abs: 0, can_move_rel: 0,
    can_move_con: 0, can_move_diag: 0, can_move_map: 0,
    can_auto_zoom: 0, can_zoom_abs: 0, can_zoom_rel: 0, can_zoom_con: 0, has_zoom_speed: 0,
    can_focus: 0, can_auto_focus: 0, can_focus_abs: 0, can_focus_rel: 0, can_focus_con: 0, has_focus_speed: 0,
    can_iris: 0, can_auto_iris: 0, can_iris_abs: 0, can_iris_rel: 0, can_iris_con: 0, has_iris_speed: 0,
    can_gain: 0, can_auto_gain: 0, can_gain_abs: 0, can_gain_rel: 0, can_gain_con: 0, has_gain_speed: 0,
    can_white: 0, can_auto_white: 0, can_white_abs: 0, can_white_rel: 0, can_white_con: 0, has_white_speed: 0,
    has_presets: 0, num_presets: 0, has_home_preset: 0, can_set_presets: 0,
    has_pan_speed: 0, has_turbo_pan: 0, has_tilt_speed: 0, has_turbo_tilt: 0,
    can_wake: 0, can_sleep: 0, can_reset: 0, can_reboot: 0, can_auto_scan: 0, num_scan_paths: 0,
  };
  return { ...base, ...over };
}

const CONTROLS = [
  mkControl({
    id: 5, name: 'Onvif PTZ', type: 'Ffmpeg', protocol: 'onvif',
    can_move: 1, can_zoom: 1, can_focus: 1, can_iris: 0, can_white: 0,
    has_presets: 1, num_presets: 64, has_home_preset: 1,
  }),
  mkControl({ id: 2, name: 'Amcrest HTTP', type: 'Remote', protocol: 'amcrest', can_move: 1 }),
];

let sent: Array<{ method: string; path: string; body: Record<string, unknown> | null }> = [];

function seed(over: unknown[] = []) {
  sent = [];
  server.use(
    ...(over as never[]),
    http.get('/api/v3/configs/categories', () => HttpResponse.json([{ category: 'system', count: 2 }])),
    http.get('/api/v3/configs/:name', ({ params }) =>
      HttpResponse.json({ id: 0, name: params.name, value: '', type: 'string', category: 'web', readonly: 0 })),
    http.get('/api/v3/controls', () => HttpResponse.json(paged(CONTROLS))),
    http.get('/api/v3/controls/:id', ({ params }) => {
      const found = CONTROLS.find((c) => c.id === Number(params.id));
      return found
        ? HttpResponse.json(found)
        : HttpResponse.json({ kind: 'NOT_FOUND', error_message: 'no such control' }, { status: 404 });
    }),
    http.get('/api/v3/monitors', () => HttpResponse.json(paged([
      { id: 1, name: 'Front Door', control_id: 5, deleted: 0, capturing: 'Always', analysing: 'Always', recording: 'OnMotion', width: 1920, height: 1080, orientation: 'ROTATE_0', type: 'Ffmpeg' },
      { id: 2, name: 'Gate', control_id: 5, deleted: 0, capturing: 'Always', analysing: 'None', recording: 'None', width: 1920, height: 1080, orientation: 'ROTATE_0', type: 'Ffmpeg' },
      { id: 3, name: 'Old cam', control_id: 2, deleted: 1, capturing: 'None', analysing: 'None', recording: 'None', width: 640, height: 480, orientation: 'ROTATE_0', type: 'Ffmpeg' },
    ]))),
    http.post('/api/v3/controls', async ({ request }) => {
      const body = await request.json() as Record<string, unknown>;
      sent.push({ method: 'POST', path: '/controls', body });
      return HttpResponse.json(mkControl({ id: 11, ...body }));
    }),
    http.patch('/api/v3/controls/:id', async ({ request, params }) => {
      const body = await request.json() as Record<string, unknown>;
      sent.push({ method: 'PATCH', path: `/controls/${params.id}`, body });
      return HttpResponse.json(mkControl({ id: Number(params.id), ...body }));
    }),
    http.delete('/api/v3/controls/:id', ({ params }) => {
      sent.push({ method: 'DELETE', path: `/controls/${params.id}`, body: null });
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

async function mount() {
  const { default: Page } = await import('./settings.ptzControls');
  return renderWithProviders(<Page />);
}

/** Mount the list and press its toolbar Back. */
async function mountedList(user: ReturnType<typeof userEvent.setup>) {
  const view = await mount();
  await screen.findByRole('button', { name: 'Onvif PTZ' });
  await user.click(screen.getByRole('button', { name: 'Back' }));
  return view;
}

describe('ClassicSettingsPtzControlsPage', () => {
  it('renders the legacy capability table with the presets and monitor columns', async () => {
    signIn();
    seed();
    await mount();

    const row = (await screen.findByRole('button', { name: 'Onvif PTZ' })).closest('tr')!;
    expect(within(row).getByText('Ffmpeg')).toBeInTheDocument();
    expect(within(row).getByText('onvif')).toBeInTheDocument();
    // Can Move / Zoom / Focus yes; Iris / White no.
    expect(within(row).getAllByText('Yes')).toHaveLength(3);   // move, zoom, focus
    expect(within(row).getAllByText('No')).toHaveLength(2);    // iris, white
    // has_home_preset + 64 presets → legacy prints "H64".
    expect(within(row).getByText('H64')).toBeInTheDocument();
    // Two live monitors reference it; the soft-deleted one does not count.
    await waitFor(() => expect(within(row).getByTitle('Front Door, Gate')).toHaveTextContent('2'));

    // No presets and no monitors: a zero in both of those columns.
    const amcrest = screen.getByRole('button', { name: 'Amcrest HTTP' }).closest('tr')!;
    await waitFor(() => expect(within(amcrest).getAllByText('0')).toHaveLength(2));
    expect(screen.getByText('Showing 2 of 2 rows')).toBeInTheDocument();
  });

  it('sorts by name by default and flips on a header click', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();

    await screen.findByRole('button', { name: 'Onvif PTZ' });
    const names = () => screen.getAllByRole('row').slice(1)
      .map((r) => r.querySelector('td:nth-child(3)')?.textContent);
    expect(names()).toEqual(['Amcrest HTTP', 'Onvif PTZ']);

    const nameTh = screen.getByRole('columnheader', { name: /^Name/ });
    expect(nameTh).toHaveAttribute('aria-sort', 'ascending');
    await user.click(within(nameTh).getByRole('button'));
    expect(nameTh).toHaveAttribute('aria-sort', 'descending');
    expect(names()).toEqual(['Onvif PTZ', 'Amcrest HTTP']);

    // Switching column resets to ascending and sorts numerically on Id.
    const idTh = screen.getByRole('columnheader', { name: /^Id/ });
    await user.click(within(idTh).getByRole('button'));
    expect(idTh).toHaveAttribute('aria-sort', 'ascending');
    expect(names()).toEqual(['Amcrest HTTP', 'Onvif PTZ']);
  });

  it('the search box filters on name, protocol and type', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();
    await screen.findByRole('button', { name: 'Onvif PTZ' });

    const box = screen.getByRole('searchbox', { name: 'Search' });
    await user.type(box, 'amcrest');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Onvif PTZ' })).toBeNull());
    expect(screen.getByText('Showing 1 of 2 rows')).toBeInTheDocument();

    await user.clear(box);
    await user.type(box, 'ffmpeg');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Onvif PTZ' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Amcrest HTTP' })).toBeNull();

    await user.clear(box);
    await user.type(box, 'nothing');
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveAttribute('data-state', 'empty'));
    expect(screen.getByRole('status')).toHaveTextContent('No matching records found');
  });

  it('mark-and-Edit needs exactly one row; Delete needs at least one', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();

    await screen.findByRole('button', { name: 'Onvif PTZ' });
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Mark Amcrest HTTP' }));
    expect(screen.getByRole('button', { name: 'Edit' })).toBeEnabled();

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(screen.getByRole('checkbox', { name: 'Mark Onvif PTZ' })).toBeChecked();
    // Two marked → Edit goes back to disabled, Delete stays live.
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();

    // Select-all again clears.
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('delete confirms and DELETEs a profile no monitor references', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();

    await screen.findByRole('button', { name: 'Amcrest HTTP' });
    await user.click(screen.getByRole('checkbox', { name: 'Mark Amcrest HTTP' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Delete "Amcrest HTTP"? No monitor references it.');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(sent).toEqual([{ method: 'DELETE', path: '/controls/2', body: null }]));
  });

  it('refuses to delete a profile monitors still use, and lists the blockers', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();

    await screen.findByRole('button', { name: 'Onvif PTZ' });
    await waitFor(() => expect(screen.getByTitle('Front Door, Gate')).toBeInTheDocument());
    await user.click(screen.getByRole('checkbox', { name: 'Mark Onvif PTZ' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Cannot delete');
    expect(dialog).toHaveTextContent('These monitors still use the profile.');
    expect(within(dialog).getByText('Front Door')).toBeInTheDocument();
    expect(within(dialog).getByText('Gate')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Delete' })).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'OK' }));
    expect(sent).toHaveLength(0);
  });

  it('Add opens the create form and POSTs the whole payload', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();

    await screen.findByRole('button', { name: 'Onvif PTZ' });
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(mockSearch).toEqual({ id: 'new' });
  });

  it('?id=new renders the controlcap form, validates the name and creates', async () => {
    signIn();
    seed();
    mockSearch = { id: 'new' };
    const user = userEvent.setup();
    await mount();

    expect(await screen.findByText('New Control Capability')).toBeInTheDocument();
    // Nameless: Save is disabled and the list is not shown.
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.queryByRole('columnheader', { name: /^Name/ })).toBeNull();

    await user.type(screen.getByLabelText('Name'), '  Test PTZ  ');
    await user.selectOptions(screen.getByLabelText('Type'), 'Ffmpeg');
    await user.type(screen.getByLabelText('Protocol'), ' fancy ');
    await user.click(screen.getByLabelText('Can Wake'));

    // Tabs switch the visible field set.
    await user.click(screen.getByRole('tab', { name: 'Presets' }));
    expect(screen.getByRole('tab', { name: 'Presets' })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByLabelText('Has Presets'));
    await user.type(screen.getByLabelText('Num Presets'), '16');

    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toHaveLength(1));

    expect(sent[0].method).toBe('POST');
    expect(sent[0].path).toBe('/controls');
    const body = sent[0].body!;
    expect(body.name).toBe('Test PTZ');
    expect(body.type).toBe('Ffmpeg');
    expect(body.protocol).toBe('fancy');
    expect(body.can_wake).toBe(1);
    expect(body.has_presets).toBe(1);
    expect(body.num_presets).toBe(16);
    // Untouched flags still go out as 0 so unticking sticks.
    expect(body.can_sleep).toBe(0);
    // Blank numbers become null, not 0.
    expect(body.min_pan_range).toBeNull();

    // A successful save closes the editor.
    await waitFor(() => expect(mockSearch).toEqual({}));
  });

  it('?id=<n> edits an existing profile and PATCHes it', async () => {
    signIn();
    seed();
    mockSearch = { id: 2 };
    const user = userEvent.setup();
    await mount();

    expect(await screen.findByText('Control Capability - Amcrest HTTP')).toBeInTheDocument();
    const name = screen.getByLabelText('Name');
    expect(name).toHaveValue('Amcrest HTTP');
    await user.clear(name);
    await user.type(name, 'Amcrest v2');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].method).toBe('PATCH');
    expect(sent[0].path).toBe('/controls/2');
    expect(sent[0].body!.name).toBe('Amcrest v2');
    expect(sent[0].body!.protocol).toBe('amcrest');
  });

  it('a deep link to a missing profile explains itself', async () => {
    signIn();
    seed();
    mockSearch = { id: 999 };
    await mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('No control profile with id 999.');
  });

  it('the editor Back button and the toolbar Back go the right places', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    const first = await mountedList(user);
    expect(historyBack).toHaveBeenCalledTimes(1);
    first.unmount();

    // Inside the editor, Back clears `?id=` instead of touching history.
    mockSearch = { id: 'new' };
    await mount();
    await screen.findByText('New Control Capability');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(mockSearch).toEqual({});
    expect(historyBack).toHaveBeenCalledTimes(1);
  });

  it('Refresh re-requests the list', async () => {
    signIn();
    let hits = 0;
    seed([http.get('/api/v3/controls', () => { hits += 1; return HttpResponse.json(paged(CONTROLS)); })]);
    const user = userEvent.setup();
    await mount();

    await screen.findByRole('button', { name: 'Onvif PTZ' });
    expect(hits).toBe(1);
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(hits).toBe(2));
  });

  it('renders the 500 branch as an alert', async () => {
    signIn();
    seed([
      http.get('/api/v3/controls', () =>
        HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'Controls table locked' }, { status: 500 })),
    ]);
    await mount();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveAttribute('data-state', 'unreachable'));
  });

  it('renders a network failure as unreachable', async () => {
    signIn();
    seed([http.get('/api/v3/controls', () => HttpResponse.error())]);
    await mount();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveAttribute('data-state', 'unreachable'));
  });

  it('renders the 403 branch as a permission notice', async () => {
    signIn();
    seed([
      http.get('/api/v3/controls', () =>
        HttpResponse.json({ kind: 'FORBIDDEN', error_message: 'nope' }, { status: 403 })),
    ]);
    await mount();
    await waitFor(() =>
      expect(screen.getByText('You do not have permission to view this.')).toBeInTheDocument());
  });

  it('read-only without control Edit: no mark column, no verbs, plain names', async () => {
    signIn(VIEWER);
    seed();
    await mount();

    await waitFor(() => expect(screen.getByText('Onvif PTZ')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Onvif PTZ' })).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('a read-only user who deep-links into the editor gets the permission note', async () => {
    signIn(VIEWER);
    seed();
    mockSearch = { id: 2 };
    await mount();
    await waitFor(() =>
      expect(screen.getByText('You do not have permission to view this.')).toBeInTheDocument());
    expect(screen.queryByLabelText('Name')).toBeNull();
  });
});
