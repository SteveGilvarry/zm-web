import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw/http';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { TagChips, type TagChipsApi } from './TagChips';
import { useAuthStore } from '@/stores/auth';
import { useEventPlaybackStore } from '@/stores/eventPlayback';
import { orderByRecency } from './tagOrder';

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledFrame: 'warn' });
});
beforeEach(() => useEventPlaybackStore.setState({ tagRecency: [] }));
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

const TAGS = [
  { id: 1, name: 'review',  event_count: 3 },
  { id: 2, name: 'important', event_count: 1 },
];

describe('TagChips — empty state', () => {
  it("shows 'No tags' when the event has none", () => {
    server.use(http.get('/api/v3/tags', () => HttpResponse.json({
      items: TAGS, total: TAGS.length, per_page: 200, current_page: 1, last_page: 1,
    })));
    renderWithProviders(<TagChips eventId={42} currentTags={[]} />);
    expect(screen.getByText(/no tags/i)).toBeInTheDocument();
  });
});

describe('TagChips — attached tags', () => {
  it('renders each attached tag as a removable chip', () => {
    server.use(http.get('/api/v3/tags', () => HttpResponse.json({
      items: TAGS, total: TAGS.length, per_page: 200, current_page: 1, last_page: 1,
    })));
    renderWithProviders(
      <TagChips eventId={42} currentTags={[{ id: 1, name: 'review' }]} />,
    );
    expect(screen.getByText('review')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove tag review/i })).toBeInTheDocument();
  });
});

describe('TagChips — creating a brand-new tag', () => {
  it('POSTs /tags then attaches the returned tag in one round-trip', async () => {
    const user = userEvent.setup();
    let createBody: unknown = null;
    let attachBody: unknown = null;

    server.use(
      http.get('/api/v3/tags', () => HttpResponse.json({
        items: TAGS, total: TAGS.length, per_page: 200, current_page: 1, last_page: 1,
      })),
      http.post('/api/v3/tags', async ({ request }) => {
        createBody = await request.json();
        return HttpResponse.json({ id: 99, name: 'urgent', event_count: 0 });
      }),
      http.post('/api/v3/events-tags', async ({ request }) => {
        attachBody = await request.json();
        return HttpResponse.json({ tag_id: 99, event_id: 42 });
      }),
    );

    renderWithProviders(<TagChips eventId={42} currentTags={[]} />);

    // Wait for the suggestions query to settle so the input is ready.
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/add tag/i)).toBeInTheDocument(),
    );

    await user.type(screen.getByPlaceholderText(/add tag/i), 'urgent');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(createBody).toEqual({ name: 'urgent' }));
    expect(attachBody).toEqual({ event_id: 42, tag_id: 99 });
  });
});

describe('TagChips — attaching an existing tag', () => {
  it('skips the POST /tags step and just attaches', async () => {
    const user = userEvent.setup();
    let createHits = 0;
    let attachBody: unknown = null;

    server.use(
      http.get('/api/v3/tags', () => HttpResponse.json({
        items: TAGS, total: TAGS.length, per_page: 200, current_page: 1, last_page: 1,
      })),
      http.post('/api/v3/tags', () => {
        createHits += 1;
        return HttpResponse.json({ id: 0, name: '' });
      }),
      http.post('/api/v3/events-tags', async ({ request }) => {
        attachBody = await request.json();
        return HttpResponse.json({});
      }),
    );

    renderWithProviders(<TagChips eventId={42} currentTags={[]} />);

    await waitFor(() =>
      expect(screen.getByPlaceholderText(/add tag/i)).toBeInTheDocument(),
    );
    await user.type(screen.getByPlaceholderText(/add tag/i), 'review');
    await user.keyboard('{Enter}');

    await waitFor(() =>
      expect(attachBody).toEqual({ event_id: 42, tag_id: 1 }),
    );
    expect(createHits).toBe(0); // never created — tag already existed
  });
});

describe('TagChips — removing an attached tag', () => {
  it('DELETEs /events-tags/{tagId}/{eventId} when the × is clicked', async () => {
    const user = userEvent.setup();
    let deletePath = '';

    server.use(
      http.get('/api/v3/tags', () => HttpResponse.json({
        items: TAGS, total: TAGS.length, per_page: 200, current_page: 1, last_page: 1,
      })),
      http.delete('/api/v3/events-tags/:tagId/:eventId', ({ params }) => {
        deletePath = `${params.tagId}/${params.eventId}`;
        return HttpResponse.json({}, { status: 204 });
      }),
    );

    renderWithProviders(
      <TagChips eventId={42} currentTags={[{ id: 1, name: 'review' }]} />,
    );

    await user.click(screen.getByRole('button', { name: /remove tag review/i }));
    await waitFor(() => expect(deletePath).toBe('1/42'));
  });
});

// Hint to keep vi imported for future test additions
void vi;

describe('TagChips — the page keyboard shortcuts', () => {
  function Harness({ api }: { api: React.RefObject<TagChipsApi | null> }) {
    return <TagChips eventId={42} currentTags={[{ id: 1, name: 'review' }]} apiRef={api} />;
  }

  it('focuses the input and attaches the first free tag through its api', async () => {
    let attached: unknown = null;
    server.use(
      http.get('/api/v3/tags', () => HttpResponse.json({
        items: TAGS, total: TAGS.length, per_page: 200, current_page: 1, last_page: 1,
      })),
      http.post('/api/v3/events-tags', async ({ request }) => {
        attached = await request.json();
        return HttpResponse.json({ ok: true });
      }),
      http.get('/api/v3/events/42', () => HttpResponse.json({ id: 42 })),
    );

    const api = createRef<TagChipsApi>();
    renderWithProviders(<Harness api={api} />);
    await waitFor(() => expect(api.current).not.toBeNull());

    act(() => api.current!.focus());
    expect(screen.getByTestId('tag-input')).toHaveFocus();

    // `review` is already on the event, so the first *available* tag is
    // `important` — which is what legacy's Ctrl+↓ attaches.
    act(() => api.current!.addFirst());
    await waitFor(() => expect(attached).toEqual({ event_id: 42, tag_id: 2 }));
  });
});

describe('TagChips — last tag used and the dropdown', () => {
  const THREE = [...TAGS, { id: 3, name: 'vehicle', event_count: 0 }];
  function stub(record: (body: unknown) => void) {
    server.use(
      http.get('/api/v3/tags', () => HttpResponse.json({
        items: THREE, total: THREE.length, per_page: 200, current_page: 1, last_page: 1,
      })),
      http.post('/api/v3/events-tags', async ({ request }) => {
        record(await request.json());
        return HttpResponse.json({ ok: true });
      }),
      http.get('/api/v3/events/:id', () => HttpResponse.json({ id: 42 })),
    );
  }

  it('orders tags most recently used first, the rest as listed', () => {
    const tags = THREE.map((t) => ({ ...t }));
    expect(orderByRecency(tags, [3, 1]).map((t) => t.id)).toEqual([3, 1, 2]);
    expect(orderByRecency(tags, []).map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it('remembers the tag it applied and applies it again on the next event', async () => {
    const user = userEvent.setup();
    const bodies: unknown[] = [];
    stub((b) => bodies.push(b));
    const api = createRef<TagChipsApi>();
    const { unmount } = renderWithProviders(<TagChips eventId={42} currentTags={[]} apiRef={api} />);

    await user.click(screen.getByTestId('tag-input'));
    await user.click(await screen.findByRole('button', { name: /vehicle/ }));
    await waitFor(() => expect(bodies).toEqual([{ event_id: 42, tag_id: 3 }]));
    expect(useEventPlaybackStore.getState().tagRecency).toEqual([3]);
    unmount();

    // The next event: Tag & Next applies `vehicle`, not the first listed tag.
    renderWithProviders(<TagChips eventId={43} currentTags={[]} apiRef={api} />);
    // Once /tags has answered, focus lists them.
    await user.click(screen.getByTestId('tag-input'));
    await screen.findByRole('button', { name: /vehicle/ });
    act(() => api.current!.addFirst());
    await waitFor(() => expect(bodies.at(-1)).toEqual({ event_id: 43, tag_id: 3 }));
  });

  it('does nothing when the last tag used is already on the event, as legacy does', async () => {
    const bodies: unknown[] = [];
    stub((b) => bodies.push(b));
    useEventPlaybackStore.setState({ tagRecency: [1] });
    const api = createRef<TagChipsApi>();
    renderWithProviders(<TagChips eventId={42} currentTags={[{ id: 1, name: 'review' }]} apiRef={api} />);
    await waitFor(() => expect(api.current).not.toBeNull());
    // Wait for /tags, so the no-op is the rule and not an empty list.
    act(() => api.current!.focus());
    await screen.findByRole('button', { name: /important/ });
    act(() => api.current!.addFirst());
    await new Promise((r) => setTimeout(r, 50));
    expect(bodies).toEqual([]);
  });

  it('opens the dropdown on focus with every free tag, recent first', async () => {
    stub(() => {});
    useEventPlaybackStore.setState({ tagRecency: [3] });
    const api = createRef<TagChipsApi>();
    renderWithProviders(<TagChips eventId={42} currentTags={[{ id: 1, name: 'review' }]} apiRef={api} />);
    await waitFor(() => expect(api.current).not.toBeNull());

    act(() => api.current!.focus());
    const list = await screen.findByTestId('tag-suggestions');
    expect([...list.querySelectorAll('button')].map((b) => b.textContent?.replace(/\d+$/, ''))).toEqual([
      'vehicle', 'important',
    ]);
  });
});
