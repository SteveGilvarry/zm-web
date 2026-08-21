/**
 * Tests for the Events list (classic skin) — legacy `?view=events`: the
 * filter form row, the bootstrap-table toolbar, the legacy table and the
 * footer pager. Everything the page owns is state in the URL, so the
 * assertions are about what reaches the backend and what comes back.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { useAuthStore } from '@/stores/auth';
import { useEventsColumnsStore } from '@/stores/eventsColumns';
import { useEventPlaybackStore } from '@/stores/eventPlayback';

/* ---------------------------------------------------------------- router */

/**
 * The page keeps every filter in the URL. A tiny in-memory router stands in
 * for `useSearch` / `useNavigate` so a setter re-renders the page with the
 * new search, exactly like the real router does.
 */
type SearchUpdater = Record<string, unknown> | ((prev: Record<string, unknown>) => Record<string, unknown>);
const SearchCtx = createContext<{ search: Record<string, unknown>; set: (u: SearchUpdater) => void }>({
  search: {}, set: () => {},
});
let initialSearch: Record<string, unknown> = {};

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => useContext(SearchCtx).search,
  useNavigate: () => {
    const { set } = useContext(SearchCtx);
    return ({ search }: { search?: SearchUpdater }) => { if (search) set(search); };
  },
  Link: ({
    children, to, params, search, ...rest
  }: {
    children?: ReactNode;
    to?: string;
    params?: Record<string, string>;
    search?: Record<string, unknown>;
    [k: string]: unknown;
  }) => {
    const path = to && params
      ? Object.entries(params).reduce((acc, [k, v]) => acc.replace(`$${k}`, String(v)), to)
      : (to ?? '#');
    const qs = search
      ? `?${new URLSearchParams(
        Object.entries(search).reduce((acc, [k, v]) => {
          if (v != null) acc[k] = String(v);
          return acc;
        }, {} as Record<string, string>),
      ).toString()}`
      : '';
    return <a href={`${path}${qs}`} {...rest}>{children}</a>;
  },
}));

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

/* -------------------------------------------------------------- fixtures */

const paged = <T,>(items: T[], over: Record<string, unknown> = {}) => ({
  items, total: items.length, per_page: 25, current_page: 1, last_page: 1, ...over,
});

function event(id: number, over: Record<string, unknown> = {}) {
  return {
    id, monitor_id: 1, name: `Event-${id}`, cause: 'Motion',
    start_date_time: '2026-08-21T12:00:00Z', end_date_time: '2026-08-21T12:00:30Z',
    width: 1920, height: 1080, length: '30.00', frames: 100, alarm_frames: 5,
    tot_score: 120, avg_score: 12, max_score: 44, archived: 0, videoed: 1,
    uploaded: 0, emailed: 0, messaged: 0, executed: 0, notes: null, state_id: 1,
    orientation: 'ROTATE_0', disk_space: 1_048_576, scheme: 'Medium', locked: 0,
    tags: [], storage_id: 1, ...over,
  };
}

const DEFAULT_CONFIGS: Record<string, string> = {
  ZM_WEB_EVENTS_PER_PAGE: '25',
  ZM_WEB_EVENT_SORT_FIELD: 'StartDateTime',
  ZM_WEB_EVENT_SORT_ORDER: 'asc',
  ZM_WEB_LIST_THUMBS: '0',
  ZM_WEB_LIST_THUMB_WIDTH: '48',
};

const server = setupServer();
/** Query strings of every `/events` request, for asserting the filters. */
let eventRequests: URLSearchParams[] = [];

interface StubOptions {
  events?: unknown[];
  configs?: Record<string, string>;
  total?: number;
  lastPage?: number;
  groups?: unknown[];
  tags?: unknown[];
}

function stub(options: StubOptions = {}) {
  const {
    events = [event(1), event(2, { cause: 'Continuous', notes: 'parcel at door' })],
    configs = {}, total, lastPage = 1,
    groups = [{ id: 3, name: 'Front Yard' }],
    tags = [{ id: 5, name: 'person' }],
  } = options;
  const cfg = { ...DEFAULT_CONFIGS, ...configs };
  eventRequests = [];
  server.use(
    http.get('/api/v3/events', ({ request }) => {
      eventRequests.push(new URL(request.url).searchParams);
      return HttpResponse.json(paged(events, { total: total ?? events.length, last_page: lastPage }));
    }),
    http.get('/api/v3/configs/:name', ({ params }) => {
      const name = String(params.name);
      return name in cfg
        ? HttpResponse.json({ name, value: cfg[name], type: 'string' })
        : HttpResponse.json({ kind: 'NOT_FOUND', error_message: 'no such config' }, { status: 404 });
    }),
    http.get('/api/v3/monitors', () => HttpResponse.json(paged(
      [{ id: 1, name: 'Front Door' }, { id: 2, name: 'Driveway' }], { per_page: 100 }))),
    http.get('/api/v3/tags', () => HttpResponse.json(paged(tags, { per_page: 200 }))),
    http.get('/api/v3/groups', () => HttpResponse.json(paged(groups, { per_page: 200 }))),
    http.get('/api/v3/groups-monitors', () => HttpResponse.json(paged(
      [{ id: 1, group_id: 3, monitor_id: 1 }], { per_page: 1000 }))),
    http.get('/api/v3/storage', () => HttpResponse.json(paged(
      [{ id: 1, name: 'Default', path: '/var/cache/zoneminder/events', type: 'local', enabled: 1 }],
      { per_page: 100 }))),
  );
}

const ALL_EDIT = {
  iat: 0, exp: 0, user: 'admin',
  perms: {
    stream: 'Edit', events: 'Edit', control: 'Edit', monitors: 'Edit',
    groups: 'Edit', devices: 'Edit', snapshots: 'Edit', system: 'Edit',
  },
};

function signIn(perms: unknown = ALL_EDIT) {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', isAuthenticated: true, user: perms as never,
  });
}

beforeAll(() => { server.listen({ onUnhandledRequest: 'error' }); });
beforeEach(() => { signIn(); });
afterEach(() => {
  server.resetHandlers();
  initialSearch = {};
  useEventsColumnsStore.getState().resetDefaults();
  useEventPlaybackStore.setState({});
});
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

async function mount() {
  const { default: Page } = await import('./events.list');
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    const [search, setSearch] = useState(initialSearch);
    const set = (u: SearchUpdater) => setSearch((prev) => (typeof u === 'function' ? u(prev) : u));
    return (
      <SearchCtx.Provider value={{ search, set }}>
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      </SearchCtx.Provider>
    );
  }
  return render(<Page />, { wrapper: Wrapper });
}

/** Wait until the seeded events are on screen. */
async function mountAndSettle() {
  const view = await mount();
  await screen.findByRole('link', { name: 'Event-1' });
  return view;
}

/* ----------------------------------------------------------------- tests */

describe('ClassicEventsListPage — rendering', () => {
  it('renders the legacy table with the events and the monitor name', async () => {
    stub();
    await mountAndSettle();

    expect(screen.getByRole('link', { name: 'Event-2' })).toHaveAttribute('href', '/events/2');
    expect(screen.getAllByRole('link', { name: 'Front Door' })[0])
      .toHaveAttribute('href', '/monitors/1');
    expect(screen.getByText('Continuous')).toBeInTheDocument();
    expect(screen.getByText('Showing 1 to 2 of 2 rows')).toBeInTheDocument();
  });

  it('offers the legacy filter fields with the fetched options', async () => {
    stub();
    await mountAndSettle();

    expect(within(screen.getByLabelText(/Group/)).getByRole('option', { name: 'Front Yard' })).toBeInTheDocument();
    expect(within(screen.getByLabelText(/Monitor =/)).getByRole('option', { name: 'Driveway' })).toBeInTheDocument();
    expect(within(screen.getByLabelText(/Tags/)).getByRole('option', { name: 'person' })).toBeInTheDocument();
    const archived = screen.getByLabelText(/Archive Status/);
    expect(within(archived).getByRole('option', { name: 'Unarchived Only' })).toBeInTheDocument();
    expect(within(archived).getByRole('option', { name: 'Archived Only' })).toBeInTheDocument();
  });

  it('hides the Group field when the install has no groups', async () => {
    stub({ groups: [] });
    await mountAndSettle();
    expect(screen.queryByLabelText(/Group/)).toBeNull();
  });

  it('shows the last-hour hint and clears it on demand', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();

    const hint = screen.getByTestId('default-hour-hint');
    expect(hint).toHaveTextContent('Showing events from the last hour only');
    await user.click(within(hint).getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(screen.queryByTestId('default-hour-hint')).toBeNull());
  });
});

describe('ClassicEventsListPage — filters', () => {
  it('sends the monitor filter to the backend', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();

    await user.selectOptions(screen.getByLabelText(/Monitor =/), '2');
    await waitFor(() =>
      expect(eventRequests.at(-1)?.get('monitor_id')).toBe('2'));
  });

  it('sends the archive-status filter to the backend', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();

    await user.selectOptions(screen.getByLabelText(/Archive Status/), 'archived');
    await waitFor(() => expect(eventRequests.at(-1)?.get('archived')).toBe('true'));
  });

  it('narrows the page locally with the search box and says so', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();

    await user.type(screen.getByRole('searchbox', { name: 'Search events' }), 'continuous');
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Event-1' })).toBeNull());
    expect(screen.getByRole('link', { name: 'Event-2' })).toBeInTheDocument();
    expect(screen.getByText(/apply within this page: 1 of 2 rows/)).toBeInTheDocument();
  });

  it('narrows by notes substring', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();

    await user.type(screen.getByLabelText(/Notes/), 'parcel');
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Event-1' })).toBeNull());
    expect(screen.getByRole('link', { name: 'Event-2' })).toBeInTheDocument();
  });

  it('resets every filter from the toolbar', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();

    await user.selectOptions(screen.getByLabelText(/Monitor =/), '2');
    await waitFor(() => expect(screen.getByLabelText(/Monitor =/)).toHaveValue('2'));

    await user.click(screen.getByRole('button', { name: 'Reset filters' }));
    await waitFor(() => expect(screen.getByLabelText(/Monitor =/)).toHaveValue('all'));
  });

  it('sends a group filter through /filters/preview with the group\'s monitors', async () => {
    const user = userEvent.setup();
    stub();
    let previewBody: Record<string, unknown> | null = null;
    server.use(http.post('/api/v3/filters/preview', async ({ request }) => {
      previewBody = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json(paged([event(9)], { total: 1 }));
    }));
    await mountAndSettle();

    await user.selectOptions(screen.getByLabelText(/Group/), '3');
    await waitFor(() => expect(previewBody).not.toBeNull());
    expect(JSON.stringify(previewBody)).toContain('monitor_id');
    expect(await screen.findByRole('link', { name: 'Event-9' })).toBeInTheDocument();
  });

  it('narrows by tag', async () => {
    const user = userEvent.setup();
    stub({ events: [event(1, { tags: [] }), event(2, { tags: [{ id: 5, name: 'person' }] })] });
    await mountAndSettle();

    await user.selectOptions(screen.getByLabelText(/Tags/), '5');
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Event-1' })).toBeNull());
    expect(screen.getByRole('link', { name: 'Event-2' })).toBeInTheDocument();
  });

  it('bounds the window with the two Start Date/Time fields', async () => {
    stub();
    await mountAndSettle();

    // `user.type` cannot drive a datetime-local field segment by segment in
    // jsdom; set the value the way the browser commits it.
    fireEvent.change(screen.getByLabelText('Events starting after'), { target: { value: '2026-08-21T10:00' } });
    await waitFor(() =>
      expect(eventRequests.at(-1)?.get('start_time')).toBe(new Date('2026-08-21T10:00').toISOString().replace(/\.\d{3}Z$/, 'Z')));
    fireEvent.change(screen.getByLabelText('Events starting before'), { target: { value: '2026-08-21T11:00' } });
    await waitFor(() =>
      expect(eventRequests.at(-1)?.get('end_time')).toBe(new Date('2026-08-21T11:00').toISOString().replace(/\.\d{3}Z$/, 'Z')));
  });

  it('refetches from the filter-row refresh button', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();
    const before = eventRequests.length;
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(eventRequests.length).toBeGreaterThan(before));
  });

  it('links "save as filter" with the current conditions', async () => {
    initialSearch = { monitor_id: 2 };
    stub();
    await mountAndSettle();

    const link = screen.getByTitle('Save these conditions as a filter');
    // The href carries the conditions as ZoneMinder filter terms, JSON-encoded.
    const terms = decodeURIComponent(link.getAttribute('href')!.replace('/filters?terms=', ''));
    expect(JSON.parse(terms)).toEqual(expect.arrayContaining([
      expect.objectContaining({ val: '2' }),
    ]));
  });
});

describe('ClassicEventsListPage — toolbar, sort and pager', () => {
  it('sorts by a column header, flipping direction on the second click', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();

    await user.click(screen.getByRole('button', { name: /^Id/ }));
    await waitFor(() => expect(eventRequests.at(-1)?.get('sort')).toBe('id'));
    expect(eventRequests.at(-1)?.get('direction')).toBe('asc');

    await user.click(screen.getByRole('button', { name: /^Id/ }));
    await waitFor(() => expect(eventRequests.at(-1)?.get('direction')).toBe('desc'));
  });

  it('refetches from the toolbar refresh button', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();
    const before = eventRequests.length;
    await user.click(screen.getByRole('button', { name: 'Refresh events' }));
    await waitFor(() => expect(eventRequests.length).toBeGreaterThan(before));
  });

  it('hides a column from the Columns chooser', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();

    expect(screen.getByRole('columnheader', { name: /Cause/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Columns/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Toggle column Cause' }));
    await waitFor(() => expect(screen.queryByRole('columnheader', { name: /Cause/ })).toBeNull());
  });

  it('exports the visible events as CSV', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => 'blob:events');
    const original = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true, writable: true });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      stub();
      await mountAndSettle();
      await user.click(screen.getByRole('button', { name: 'Export visible events as CSV' }));
      expect(click).toHaveBeenCalled();
      expect(createObjectURL).toHaveBeenCalled();
    } finally {
      click.mockRestore();
      if (original) Object.defineProperty(URL, 'createObjectURL', original);
    }
  });

  it('pages through the result set', async () => {
    const user = userEvent.setup();
    stub({ total: 60, lastPage: 3 });
    await mountAndSettle();

    expect(screen.getByText('Showing 1 to 2 of 60 rows')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Go to page 2' }));
    await waitFor(() => expect(eventRequests.at(-1)?.get('page')).toBe('2'));

    await user.selectOptions(screen.getByLabelText('Rows per page'), '50');
    await waitFor(() => expect(eventRequests.at(-1)?.get('page_size')).toBe('50'));
  });
});

describe('ClassicEventsListPage — selection and failure states', () => {
  it('offers the bulk bar and enables it once a row is checked', async () => {
    const user = userEvent.setup();
    stub();
    await mountAndSettle();

    const archive = screen.getByRole('button', { name: /^Archive$/ });
    expect(archive).toBeDisabled();
    await user.click(screen.getAllByRole('checkbox', { name: /Select event/ })[0]);
    expect(screen.getByRole('button', { name: /^Archive$/ })).toBeEnabled();
  });

  it('renders an alert when the events query 500s', async () => {
    stub();
    server.use(http.get('/api/v3/events', () =>
      HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'events table locked' }, { status: 500 })));
    await mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
  });

  it('renders an alert when the backend is unreachable', async () => {
    stub();
    server.use(http.get('/api/v3/events', () => HttpResponse.error()));
    await mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
  });

  it('renders the permission notice when events are forbidden', async () => {
    stub();
    server.use(http.get('/api/v3/events', () =>
      HttpResponse.json({ kind: 'FORBIDDEN', error_message: 'nope' }, { status: 403 })));
    await mount();
    expect(await screen.findByText('You do not have permission to view this.')).toBeInTheDocument();
  });

  it('renders nothing at all when signed out', async () => {
    useAuthStore.setState({ accessToken: null, refreshToken: null, isAuthenticated: false, user: null });
    stub();
    const { container } = await mount();
    expect(container).toBeEmptyDOMElement();
  });
});
