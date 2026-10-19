/**
 * Options → Encoder Templates (classic): `_options_encoderTemplates.php`
 * and `options-encoder-templates.js` — filter, Add, Edit, Copy, Delete,
 * and the unknown-option note in the modal.
 */
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

// The dev box's rows, in its response order (by encoder string, then name).
const TEMPLATES = [
  makeEncoderTemplate({ id: 7, encoder: 'h264_nvenc', name: 'Balanced', params: 'preset=p4\nrc=vbr\ncq=23\ng=30\nbf=0\nprofile=high\npix_fmt=nv12' }),
  makeEncoderTemplate({ id: 2, encoder: 'libx264', name: 'Archival (high quality)', params: 'preset=slow\ncrf=20' }),
  makeEncoderTemplate({ id: 1, encoder: 'libx264', name: 'Balanced', description: 'Good default' }),
  makeEncoderTemplate({ id: 4, encoder: 'libx265', name: 'Balanced', params: 'preset=fast\ncrf=25' }),
];

let sent: Array<{ method: string; path: string; body: unknown }> = [];
function seed() {
  sent = [];
  server.use(
    http.get('/api/v3/me', () => HttpResponse.json({}, { status: 404 })),
    http.get('/api/v3/configs/categories', () => HttpResponse.json([])),
    http.get('/api/v3/configs', () => HttpResponse.json({ items: [], total: 0, per_page: 1000, current_page: 1, last_page: 1 })),
    http.get('/api/v3/encoder-templates', () => HttpResponse.json(TEMPLATES)),
    http.post('/api/v3/encoder-templates', async ({ request }) => {
      const body = await request.json();
      sent.push({ method: 'POST', path: '/encoder-templates', body });
      return HttpResponse.json({ ...(body as object), id: 99 }, { status: 201 });
    }),
    http.put('/api/v3/encoder-templates/:id', async ({ request, params }) => {
      const body = await request.json();
      sent.push({ method: 'PUT', path: `/encoder-templates/${params.id}`, body });
      return HttpResponse.json({ ...(body as object), id: Number(params.id) });
    }),
    http.delete('/api/v3/encoder-templates/:id', ({ params }) => {
      sent.push({ method: 'DELETE', path: `/encoder-templates/${params.id}`, body: null });
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

async function mount() {
  const { default: Page } = await import('./settings.encoderTemplates');
  return renderWithProviders(<Page />);
}

const bodyRows = () => screen.getAllByRole('row').slice(1);
const cellText = (row: HTMLElement) => within(row).getAllByRole('cell').map((c) => c.textContent);

describe('ClassicEncoderTemplatesPage', () => {
  it('lists Id / Encoder / Name / Params in legacy encoder order, params on one line', async () => {
    signIn();
    seed();
    await mount();
    await screen.findByText('Archival (high quality)');
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Id', 'Encoder', 'Name', 'Params', 'Actions']);
    expect(bodyRows().map((r) => cellText(r).slice(0, 3))).toEqual([
      ['2', 'libx264', 'Archival (high quality)'],
      ['1', 'libx264', 'Balanced'],
      ['4', 'libx265', 'Balanced'],
      ['7', 'h264_nvenc', 'Balanced'],
    ]);
    const nvenc = bodyRows()[3];
    const params = within(nvenc).getAllByRole('cell')[3];
    expect(params.textContent).toBe('preset=p4 rc=vbr cq=23 g=30 bf=0 profile=high pix_fmt=nv12');
    expect(params).toHaveAttribute('title', 'preset=p4\nrc=vbr\ncq=23\ng=30\nbf=0\nprofile=high\npix_fmt=nv12');
    expect(screen.getByRole('link', { name: 'Encoder Templates' })).toHaveAttribute('aria-current', 'page');
  });

  it('Filter by Encoder narrows the rows', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();
    await screen.findByText('Archival (high quality)');
    await user.selectOptions(screen.getByLabelText('Filter by Encoder'), 'libx265');
    expect(bodyRows().map((r) => cellText(r)[1])).toEqual(['libx265']);
    await user.selectOptions(screen.getByLabelText('Filter by Encoder'), '');
    expect(bodyRows()).toHaveLength(4);
  });

  it('Edit locks the encoder and PUTs the form', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();
    await user.click(await screen.findByRole('button', { name: 'Edit Balanced (libx264)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Encoder Template' });
    expect(within(dialog).getByLabelText('Encoder')).toBeDisabled();
    expect(within(dialog).getByLabelText('Description')).toHaveValue('Good default');
    const name = within(dialog).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Default');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      method: 'PUT',
      path: '/encoder-templates/1',
      body: { encoder: 'libx264', name: 'Default', description: 'Good default', params: TEMPLATES[2].params },
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('Copy opens the row as new with " Copy" on the name and the encoder unlocked; Save POSTs', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();
    await user.click(await screen.findByRole('button', { name: 'Copy Balanced (libx265)' }));
    const dialog = await screen.findByRole('dialog', { name: 'New Encoder Template' });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Balanced Copy');
    const encoder = within(dialog).getByLabelText('Encoder');
    expect(encoder).toBeEnabled();
    await user.selectOptions(encoder, 'hevc_nvenc');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ method: 'POST', body: { encoder: 'hevc_nvenc', name: 'Balanced Copy', params: 'preset=fast\ncrf=25' } });
  });

  it('Add New Template starts on libx264 and notes options the encoder will ignore', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();
    await user.click(await screen.findByRole('button', { name: 'Add New Template' }));
    const dialog = await screen.findByRole('dialog', { name: 'New Encoder Template' });
    expect(within(dialog).getByLabelText('Encoder')).toHaveValue('libx264');
    await user.type(within(dialog).getByLabelText('Params'), 'crf=23{enter}cq=20{enter}rc=vbr');
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      'Note: `cq`, `rc` are not recognised options for `libx264` and will be ignored at runtime.',
    );
    // Switching encoder re-lints: both are nvenc options.
    await user.selectOptions(within(dialog).getByLabelText('Encoder'), 'h264_nvenc');
    expect(within(dialog).getByRole('status')).toHaveTextContent('`crf`');

    // A name is required.
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Name is required');
    expect(sent).toHaveLength(0);
  });

  it('Delete asks legacy\'s question and DELETEs', async () => {
    signIn();
    seed();
    const user = userEvent.setup();
    await mount();
    await user.click(await screen.findByRole('button', { name: 'Delete Balanced (h264_nvenc)' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent("Delete template 'Balanced' for h264_nvenc?");
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(sent).toEqual([{ method: 'DELETE', path: '/encoder-templates/7', body: null }]));
  });

  it('a System viewer gets every write disabled', async () => {
    signIn(VIEWER);
    seed();
    await mount();
    await screen.findByText('Archival (high quality)');
    expect(screen.getByRole('button', { name: 'Add New Template' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit Balanced (libx264)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Copy Balanced (libx264)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete Balanced (libx264)' })).toBeDisabled();
  });
});
