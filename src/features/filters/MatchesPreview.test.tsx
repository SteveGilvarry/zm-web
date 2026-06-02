import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import type { FilterQuery } from '@/api/filters';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={to ?? '#'} {...rest}>{children}</a>
  ),
}));
const { MatchesPreview } = await import('./MatchesPreview');

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

const eventsFixture = [
  { id: 1, monitor_id: 1, name: 'Event 1', cause: 'Motion',     start_date_time: '2026-05-24T12:00:00Z', archived: 0 },
  { id: 2, monitor_id: 1, name: 'Event 2', cause: 'Continuous', start_date_time: '2026-05-24T12:01:00Z', archived: 0 },
  { id: 3, monitor_id: 2, name: 'Event 3', cause: 'Motion',     start_date_time: '2026-05-24T12:02:00Z', archived: 0 },
];

const emptyQuery: FilterQuery = { rules: [] };

describe('MatchesPreview — list matches button', () => {
  it("starts collapsed — clicking 'List matches' opens it", async () => {
    const user = userEvent.setup();
    server.use(http.get('/api/v3/events', () => HttpResponse.json({
      items: eventsFixture, total: 3, per_page: 200, current_page: 1, last_page: 1,
    })));

    renderWithProviders(
      <MatchesPreview query={emptyQuery} autoArchive={false} autoDelete={false} />,
    );
    expect(screen.queryByText(/event 1/i)).toBeNull();

    await user.click(screen.getByRole('button', { name: /list matches/i }));
    await waitFor(() => expect(screen.getByText(/^event 1$/i)).toBeInTheDocument());
  });

  it("shows the 'N of M match' counter after expanding", async () => {
    const user = userEvent.setup();
    server.use(http.get('/api/v3/events', () => HttpResponse.json({
      items: eventsFixture, total: 3, per_page: 200, current_page: 1, last_page: 1,
    })));

    renderWithProviders(
      <MatchesPreview query={emptyQuery} autoArchive={false} autoDelete={false} />,
    );
    await user.click(screen.getByRole('button', { name: /list matches/i }));

    await waitFor(() => {
      expect(screen.getByText(/3 of 3 .* match/i)).toBeInTheDocument();
    });
  });

  it("shows 'No events match' when the rules filter everything out", async () => {
    const user = userEvent.setup();
    server.use(http.get('/api/v3/events', () => HttpResponse.json({
      items: eventsFixture, total: 3, per_page: 200, current_page: 1, last_page: 1,
    })));

    const impossibleQuery: FilterQuery = {
      rules: [{ field: 'name', operator: '=', value: 'never matches', conjunction: 'and' }],
    };
    renderWithProviders(
      <MatchesPreview query={impossibleQuery} autoArchive={false} autoDelete={false} />,
    );
    await user.click(screen.getByRole('button', { name: /list matches/i }));
    await waitFor(() => {
      expect(screen.getByText(/no events match/i)).toBeInTheDocument();
    });
  });
});

describe('MatchesPreview — Execute Now visibility', () => {
  it('hides Execute Now when neither autoArchive nor autoDelete is set', async () => {
    server.use(http.get('/api/v3/events', () => HttpResponse.json({
      items: [], total: 0, per_page: 200, current_page: 1, last_page: 1,
    })));
    renderWithProviders(
      <MatchesPreview query={emptyQuery} autoArchive={false} autoDelete={false} />,
    );
    expect(screen.queryByRole('button', { name: /execute now/i })).toBeNull();
  });

  it('shows Execute Now when autoArchive is set', () => {
    server.use(http.get('/api/v3/events', () => HttpResponse.json({
      items: [], total: 0, per_page: 200, current_page: 1, last_page: 1,
    })));
    renderWithProviders(
      <MatchesPreview query={emptyQuery} autoArchive={true} autoDelete={false} />,
    );
    expect(screen.getByRole('button', { name: /execute now/i })).toBeInTheDocument();
  });
});

describe('MatchesPreview — Execute Now (autoArchive)', () => {
  it('PATCHes archived=true for every matching event after confirm', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const patched: number[] = [];

    server.use(
      http.get('/api/v3/events', () => HttpResponse.json({
        items: eventsFixture, total: 3, per_page: 200, current_page: 1, last_page: 1,
      })),
      http.patch('/api/v3/events/:id', async ({ params, request }) => {
        const body = await request.json() as { archived?: boolean };
        if (body.archived === true) patched.push(Number(params.id));
        return HttpResponse.json({});
      }),
    );

    renderWithProviders(
      <MatchesPreview query={emptyQuery} autoArchive={true} autoDelete={false} />,
    );
    await user.click(screen.getByRole('button', { name: /list matches/i }));
    await waitFor(() => screen.getByText(/^event 1$/i));

    await user.click(screen.getByRole('button', { name: /execute now/i }));
    await waitFor(() => expect(patched.sort()).toEqual([1, 2, 3]));
    confirmSpy.mockRestore();
  });

  it('respects a declined confirm — fires zero mutations', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    let mutationHits = 0;

    server.use(
      http.get('/api/v3/events', () => HttpResponse.json({
        items: eventsFixture, total: 3, per_page: 200, current_page: 1, last_page: 1,
      })),
      http.patch('/api/v3/events/:id', () => {
        mutationHits += 1;
        return HttpResponse.json({});
      }),
      http.delete('/api/v3/events/:id', () => {
        mutationHits += 1;
        return HttpResponse.json({}, { status: 204 });
      }),
    );

    renderWithProviders(
      <MatchesPreview query={emptyQuery} autoArchive={true} autoDelete={false} />,
    );
    await user.click(screen.getByRole('button', { name: /list matches/i }));
    await waitFor(() => screen.getByText(/^event 1$/i));

    await user.click(screen.getByRole('button', { name: /execute now/i }));
    expect(confirmSpy).toHaveBeenCalled();
    // Give microtasks a tick to drain — verify no mutation requests fired.
    await new Promise((r) => setTimeout(r, 50));
    expect(mutationHits).toBe(0);
    confirmSpy.mockRestore();
  });
});

describe('MatchesPreview — Execute Now (autoDelete)', () => {
  it('DELETEs every matching event when autoDelete is the configured action', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deleted: number[] = [];

    server.use(
      http.get('/api/v3/events', () => HttpResponse.json({
        items: eventsFixture, total: 3, per_page: 200, current_page: 1, last_page: 1,
      })),
      http.delete('/api/v3/events/:id', ({ params }) => {
        deleted.push(Number(params.id));
        return HttpResponse.json({}, { status: 204 });
      }),
    );

    renderWithProviders(
      <MatchesPreview query={emptyQuery} autoArchive={false} autoDelete={true} />,
    );
    await user.click(screen.getByRole('button', { name: /list matches/i }));
    await waitFor(() => screen.getByText(/^event 1$/i));

    await user.click(screen.getByRole('button', { name: /execute now/i }));
    await waitFor(() => expect(deleted.sort()).toEqual([1, 2, 3]));
    confirmSpy.mockRestore();
  });
});
