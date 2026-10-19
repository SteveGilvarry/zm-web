/** Settings → Encoder Templates (modern): table, filter, editor dialog, delete. */
import { describe, expect, it, vi, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { makeEncoderTemplate } from '@/test/fixtures/optionsAdmin';
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
const VIEWER = { ...ADMIN, user: 'ops', uid: 2, perms: { ...ALL_EDIT, system: 'View' } };
const signIn = (user: unknown = ADMIN) =>
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', isAuthenticated: true, user: user as never });

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

const TEMPLATES = [
  makeEncoderTemplate({ id: 1, encoder: 'libx264', name: 'Balanced' }),
  makeEncoderTemplate({ id: 9, encoder: 'hevc_vaapi', name: 'Low Power', description: null, params: 'rc_mode=CQP\nqp=30' }),
];

let sent: unknown[] = [];
function seed() {
  sent = [];
  server.use(
    http.get('/api/v3/me', () => HttpResponse.json({}, { status: 404 })),
    http.get('/api/v3/encoder-templates', () => HttpResponse.json(TEMPLATES)),
    http.put('/api/v3/encoder-templates/:id', async ({ request }) => {
      sent.push(await request.json());
      return HttpResponse.json(TEMPLATES[0]);
    }),
    http.delete('/api/v3/encoder-templates/:id', ({ params }) => {
      sent.push(`DELETE ${params.id}`);
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

async function mount() {
  const { default: Page } = await import('./settings.encoderTemplates');
  return renderWithProviders(<Page />);
}

describe('modern Settings → Encoder Templates', () => {
  it('lists, filters, edits and deletes', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();
    await screen.findByText('Low Power');
    expect(screen.getAllByRole('row')).toHaveLength(3);
    await user.selectOptions(screen.getByLabelText('Encoder'), 'hevc_vaapi');
    expect(screen.getAllByRole('row')).toHaveLength(2);
    await user.selectOptions(screen.getByLabelText('Encoder'), '');

    await user.click(screen.getByRole('button', { name: 'Edit Low Power (hevc_vaapi)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Encoder Template' });
    expect(within(dialog).getByText('One key=value per line.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Description'), 'Quiet');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toEqual([{ encoder: 'hevc_vaapi', name: 'Low Power', description: 'Quiet', params: 'rc_mode=CQP\nqp=30' }]));

    await user.click(screen.getByRole('button', { name: 'Delete Balanced (libx264)' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(sent).toContain('DELETE 1'));
  });

  it('hides the write controls from a System viewer', async () => {
    signIn(VIEWER);
    seed();
    await mount();
    await screen.findByText('Low Power');
    expect(screen.queryByRole('button', { name: 'Add Template' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull();
  });
});
