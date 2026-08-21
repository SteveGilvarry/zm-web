/**
 * Self-service password change: what it sends, what it refuses to send, and
 * the sign-out that has to follow because the backend revokes the session.
 */
import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';
import { renderWithProviders } from '@/test/render';
import { ChangePasswordDialog } from './ChangePasswordDialog';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  useToastStore.getState().clear();
});
afterAll(() => server.close());

function signIn() {
  useAuthStore.setState({
    accessToken: 't', refreshToken: 't', isAuthenticated: true,
    user: { iat: 0, exp: Date.now() / 1000 + 3600, user: 'ops' },
  });
}

function open() {
  signIn();
  return renderWithProviders(<ChangePasswordDialog isOpen onClose={() => {}} />);
}

const fill = async (user: ReturnType<typeof userEvent.setup>, current: string, next: string, confirm: string) => {
  await user.type(screen.getByLabelText('Current password'), current);
  await user.type(screen.getByLabelText('New password'), next);
  await user.type(screen.getByLabelText('Confirm new password'), confirm);
};

describe('ChangePasswordDialog', () => {
  it('PUTs current + new password and signs the operator out', async () => {
    let body: unknown = null;
    server.use(http.put('/api/v3/me/password', async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ message: 'Password changed; please sign in again' });
    }));
    const user = userEvent.setup();
    open();

    await fill(user, 'old-one', 'new-one', 'new-one');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() => expect(body).toEqual({ current_password: 'old-one', new_password: 'new-one' }));
    // The backend revokes both tokens, so staying signed in would only 401.
    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(false));
    expect(useToastStore.getState().toasts.at(-1)?.tone).toBe('success');
  });

  it('refuses to send a mismatched confirmation', async () => {
    let hits = 0;
    server.use(http.put('/api/v3/me/password', () => {
      hits += 1;
      return HttpResponse.json({ message: 'ok' });
    }));
    const user = userEvent.setup();
    open();

    await fill(user, 'old-one', 'new-one', 'new-two');
    expect(screen.getByRole('button', { name: 'Change password' })).toBeDisabled();
    expect(hits).toBe(0);
  });

  it('surfaces the backend complaint about a wrong current password', async () => {
    server.use(http.put('/api/v3/me/password', () =>
      HttpResponse.json(
        { kind: 'UNAUTHORIZED_ERROR', error_message: 'Current password is incorrect' },
        { status: 401 },
      )));
    const user = userEvent.setup();
    open();

    await fill(user, 'wrong', 'new-one', 'new-one');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/current password is incorrect/i);
    // Still signed in — nothing changed server-side.
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});
