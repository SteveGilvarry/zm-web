/** Settings → Menu (modern): draft edits, Save / Discard, sorting, disabled Reset. */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { defaultMenu } from '@/test/fixtures/optionsAdmin';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';

vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const ALL_EDIT = {
  stream: 'Edit', events: 'Edit', control: 'Edit', monitors: 'Edit',
  groups: 'Edit', devices: 'Edit', snapshots: 'Edit', system: 'Edit',
};
const ADMIN = { iat: 0, exp: 4102444800, user: 'admin', uid: 1, perms: ALL_EDIT };
const signIn = () =>
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', isAuthenticated: true, user: ADMIN as never });

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  useToastStore.getState().clear();
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

let sent: unknown[] = [];
function seed() {
  sent = [];
  server.use(
    http.get('/api/v3/me', () => HttpResponse.json({}, { status: 404 })),
    http.get('/api/v3/configs', () => HttpResponse.json({ items: [], total: 0, per_page: 1000, current_page: 1, last_page: 1 })),
    http.get('/api/v3/menu-items', () => HttpResponse.json(defaultMenu().slice(0, 3))),
    http.put('/api/v3/menu-items/:id', async ({ request, params }) => {
      sent.push({ id: Number(params.id), body: await request.json() });
      return HttpResponse.json(defaultMenu()[0]);
    }),
  );
}

describe('modern Settings → Menu', () => {
  it('Save is off until something changes; Discard drops the draft; Save sends it', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    const { default: Page } = await import('./settings.menu');
    renderWithProviders(<Page />);
    await screen.findByText('Console');
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Enable Watch' }));
    expect(save).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.getByRole('checkbox', { name: 'Enable Watch' })).toBeChecked();

    await user.click(screen.getByRole('button', { name: /Sort/ }));
    await user.click(screen.getByRole('button', { name: 'Move Console down' }));
    await user.type(screen.getByLabelText('Custom Label for Montage'), 'Wall');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toHaveLength(3));
    expect(sent).toEqual([
      { id: 2, body: { sort_order: 10 } },
      { id: 1, body: { sort_order: 20 } },
      // Renumbering touches every row: Montage goes 20 → 30.
      { id: 3, body: { label: 'Wall', sort_order: 30 } },
    ]);
    // Rows show the dashboard route a built-in opens.
    const consoleRow = screen.getByRole('checkbox', { name: 'Enable Console' }).closest('tr')!;
    expect(within(consoleRow).getByText('/')).toBeInTheDocument();
  });

  it('Reset is disabled and says why', async () => {
    signIn();
    seed();
    const { default: Page } = await import('./settings.menu');
    renderWithProviders(<Page />);
    await screen.findByText('Console');
    const reset = screen.getByRole('button', { name: /Reset/ });
    expect(reset).toBeDisabled();
    expect(reset.parentElement).toHaveAttribute('title', 'Reset needs a zm-api endpoint that does not exist yet.');
  });
});
