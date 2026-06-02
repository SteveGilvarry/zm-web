import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { TagChips } from './TagChips';
import { useAuthStore } from '@/stores/auth';

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'warn' });
});
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
