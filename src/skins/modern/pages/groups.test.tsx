/**
 * Integration-style tests for the groups page.
 *
 * The page is wrapped in <AppShell> (which expects router context) and
 * pulls in TanStack Router. We stub both so we can render just the page
 * body and exercise the tree + dialog + delete flows against MSW-faked
 * endpoints.
 */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={to ?? '#'} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: { iat: 0, exp: 4102444800, user: 'admin', uid: 1 }, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

/** Mount the page's default export. */
async function mount() {
  const { default: Page } = await import('./groups');
  return renderWithProviders(<Page />);
}

const sampleGroups = [
  { id: 1, name: 'Outdoor', parent_id: null },
  { id: 2, name: 'Indoor', parent_id: null },
  { id: 3, name: 'Front Yard', parent_id: 1 },
  { id: 4, name: 'East Lawn', parent_id: 3 },
];

function stubBaseEndpoints() {
  server.use(
    http.get('/api/v3/groups', () =>
      HttpResponse.json({
        items: sampleGroups,
        total: sampleGroups.length, per_page: 200, current_page: 1, last_page: 1,
      }),
    ),
    http.get('/api/v3/groups-monitors', () =>
      HttpResponse.json({
        items: [], total: 0, per_page: 1000, current_page: 1, last_page: 1,
      }),
    ),
    http.get('/api/v3/monitors', () =>
      HttpResponse.json({
        items: [], total: 0, per_page: 200, current_page: 1, last_page: 1,
      }),
    ),
  );
}

describe('GroupsPage — tree rendering', () => {
  it('renders groups with depth-based indentation', async () => {
    stubBaseEndpoints();
    await mount();

    // Wait for the tree to populate.
    await waitFor(() => {
      expect(screen.getByText('Outdoor')).toBeInTheDocument();
    });

    const list = screen.getByRole('list', { name: /groups tree/i });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(4);

    // Order: Outdoor, Front Yard, East Lawn, Indoor.
    expect(items[0]).toHaveTextContent('Outdoor');
    expect(items[1]).toHaveTextContent('Front Yard');
    expect(items[2]).toHaveTextContent('East Lawn');
    expect(items[3]).toHaveTextContent('Indoor');

    // Depth annotations on each li come from the page component.
    expect(items[0].getAttribute('data-depth')).toBe('0');
    expect(items[1].getAttribute('data-depth')).toBe('1');
    expect(items[2].getAttribute('data-depth')).toBe('2');
    expect(items[3].getAttribute('data-depth')).toBe('0');
  });
});

describe('GroupsPage — cascade-delete confirm', () => {
  it('asks before deleting and enumerates the descendants', async () => {
    stubBaseEndpoints();
    let deleted: string | null = null;
    server.use(
      http.delete('/api/v3/groups/:id', ({ params }) => {
        deleted = params.id as string;
        return HttpResponse.json({}, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    await mount();
    await waitFor(() => expect(screen.getByText('Outdoor')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /delete group outdoor/i }));

    expect(confirmSpy).toHaveBeenCalledOnce();
    const promptText = confirmSpy.mock.calls[0][0] as string;
    expect(promptText).toMatch(/Outdoor/);
    expect(promptText).toMatch(/2 sub-groups/); // Front Yard + East Lawn
    expect(promptText).toMatch(/Front Yard/);
    expect(promptText).toMatch(/East Lawn/);

    await waitFor(() => expect(deleted).toBe('1'));
    confirmSpy.mockRestore();
  });

  it('uses a simple confirm for a leaf group with no descendants', async () => {
    stubBaseEndpoints();
    server.use(
      http.delete('/api/v3/groups/:id', () => HttpResponse.json({}, { status: 204 })),
    );
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    await mount();
    await waitFor(() => expect(screen.getByText('East Lawn')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /delete group east lawn/i }));

    const promptText = confirmSpy.mock.calls[0][0] as string;
    expect(promptText).toMatch(/Delete group "East Lawn"\?/);
    expect(promptText).not.toMatch(/sub-group/);
    confirmSpy.mockRestore();
  });
});

describe('GroupsPage — create flow', () => {
  it('opens the dialog, sends parent_id, and refetches the list', async () => {
    stubBaseEndpoints();
    let body: Record<string, unknown> = {};
    server.use(
      http.post('/api/v3/groups', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 99, name: 'Garage', parent_id: 1 });
      }),
    );

    const user = userEvent.setup();
    await mount();
    await waitFor(() => expect(screen.getByText('Outdoor')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /new group/i }));

    const dialog = await screen.findByRole('dialog', { name: /create group/i });
    await user.type(within(dialog).getByLabelText(/name/i), 'Garage');
    await user.selectOptions(within(dialog).getByLabelText(/parent/i), '1');
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(body).toEqual({ name: 'Garage', parent_id: 1 }));
  });
});

describe('GroupsPage — edit flow (zm-api#28)', () => {
  async function editFrontYardParent(responseParent: number | null) {
    stubBaseEndpoints();
    let body: Record<string, unknown> = {};
    server.use(
      http.put('/api/v3/groups/:id', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 3, name: body.name, parent_id: responseParent });
      }),
    );
    const user = userEvent.setup();
    await mount();
    await waitFor(() => expect(screen.getByText('Front Yard')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /edit group front yard/i }));
    const dialog = await screen.findByRole('dialog', { name: /edit group/i });
    expect(within(dialog).queryByText(/not yet supported/)).not.toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText(/parent/i), '2');
    await user.click(within(dialog).getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(body).toEqual({ name: 'Front Yard', parent_id: 2 }));
    return dialog;
  }

  it('sends parent_id and stays quiet when the backend honours it', async () => {
    await editFrontYardParent(2);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('warns, without blocking, when the backend echoes the old parent', async () => {
    await editFrontYardParent(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const warning = await screen.findByRole('status');
    expect(warning).toHaveTextContent(/ignores parent changes on update/);
    expect(within(warning).getByRole('link', { name: /zm-api#28/ })).toHaveAttribute(
      'href', 'https://github.com/SteveGilvarry/zm-api/issues/28',
    );
  });
});
