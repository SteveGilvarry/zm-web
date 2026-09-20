/**
 * Settings → API Access (modern skin): the per-user toggles, Save writing
 * only what changed, and Revoke All behind a confirmation.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { renderWithProviders } from '@/test/render';
import { setupMockServer, server, db } from '@/test/msw/server';
import { makeUser } from '@/test/fixtures';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to?: string; search?: unknown }) => {
    delete rest.search;
    return <a href={to ?? '#'} {...rest}>{children}</a>;
  },
  useSearch: () => ({}),
  useNavigate: () => vi.fn(),
}));
vi.mock('@/skins/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

setupMockServer();

const ALL_EDIT = {
  stream: 'Edit', events: 'Edit', control: 'Edit', monitors: 'Edit',
  groups: 'Edit', devices: 'Edit', snapshots: 'Edit', system: 'Edit',
};

function signIn() {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', isAuthenticated: true,
    user: { iat: 0, exp: 4102444800, user: 'admin', uid: 1, perms: ALL_EDIT } as never,
  });
  useToastStore.getState().clear();
}

async function mount() {
  const { default: Page } = await import('./settings.apiTokens');
  return renderWithProviders(<Page />);
}

describe('SettingsApiTokensPage (modern)', () => {
  it('saves only the rows whose API access changed', async () => {
    signIn();
    db.users = [makeUser({ id: 1, username: 'admin', api_enabled: 1 }), makeUser({ id: 2, username: 'ops', api_enabled: 0 })];
    const sent: Array<{ id: string; body: Record<string, unknown> }> = [];
    server.use(
      http.put('/api/v3/users/:id', async ({ request, params }) => {
        sent.push({ id: String(params.id), body: (await request.json()) as Record<string, unknown> });
        return HttpResponse.json(db.users[0]);
      }),
    );
    await mount();
    const user = userEvent.setup();

    await screen.findByText('ops');
    await user.click(screen.getByRole('checkbox', { name: 'API enabled for ops' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(sent).toEqual([{ id: '2', body: { api_enabled: 1 } }]));
  });

  it('revokes every token once the confirmation is accepted', async () => {
    signIn();
    db.users = [makeUser({ id: 1, username: 'admin' })];
    const sent: Array<Record<string, unknown>> = [];
    server.use(
      http.put('/api/v3/users/:id', async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(db.users[0]);
      }),
    );
    await mount();
    const user = userEvent.setup();

    await screen.findByText('admin');
    await user.click(screen.getByRole('button', { name: 'Revoke All Tokens' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Revoke All Tokens' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(Object.keys(sent[0])).toEqual(['token_min_expiry']);
  });
});
