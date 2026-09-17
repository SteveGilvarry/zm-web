/**
 * Options → AI Datasets / AI Models / AI Classes (classic skin), legacy
 * `_options_ai_*.php`: the column order, the Mark + Delete pair, the
 * classes tab's Filter by Dataset (server-side, `?dataset_id=`), and the
 * editors legacy ships disabled but the API supports.
 */
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { renderWithProviders } from '@/test/render';
import { server } from '@/test/msw/server';
import { setupMockServer, db } from '@/test/msw/server';
import { makeAiDataset, makeAiModel, makeAiObjectClass } from '@/test/fixtures';
import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/components/common/toastStore';
import type { AiSection } from '@/skins/types';

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
const ADMIN = { iat: 0, exp: 4102444800, user: 'admin', uid: 1, perms: ALL_EDIT };
const VIEWER = { ...ADMIN, perms: { ...ALL_EDIT, system: 'View' } };

function signIn(user: unknown = ADMIN) {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', isAuthenticated: true, user: user as never,
  });
  useToastStore.getState().clear();
}

async function mount(section: AiSection) {
  const { default: Page } = await import('./settings.ai');
  return renderWithProviders(<Page section={section} />);
}

describe('ClassicSettingsAiPage', () => {
  it('renders the datasets table in legacy column order', async () => {
    signIn();
    await mount('datasets');

    expect(await screen.findByRole('button', { name: 'COCO' })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent).slice(1))
      .toEqual(['Id', 'Name', 'Version', 'Number of Classes', 'Description']);
    const row = screen.getByRole('button', { name: 'COCO' }).closest('tr')!;
    expect(within(row).getAllByRole('cell').map((c) => c.textContent).slice(1))
      .toEqual(['1', 'COCO', '2017', '80', 'Microsoft Common Objects in Context']);
  });

  it('renders models with the dataset name the list endpoint joins', async () => {
    signIn();
    db.aiModels = [makeAiModel({ id: 3, name: 'rtdetr', dataset_name: 'COCO', enabled: 0 })];
    await mount('models');

    const row = (await screen.findByRole('button', { name: 'rtdetr' })).closest('tr')!;
    const cells = within(row).getAllByRole('cell').map((c) => c.textContent);
    expect(cells.slice(1, 8)).toEqual([
      '3', 'rtdetr', 'ONNX', '8.0', 'COCO', '/var/lib/zoneminder/models/yolov8n.onnx', 'No',
    ]);
  });

  it('filters classes by dataset through the API, not in the browser', async () => {
    signIn();
    db.aiDatasets = [makeAiDataset({ id: 1, name: 'COCO' }), makeAiDataset({ id: 2, name: 'VOC', num_classes: 20 })];
    db.aiClasses = [
      makeAiObjectClass({ id: 1, dataset_id: 1, class_name: 'person', class_index: 0 }),
      makeAiObjectClass({ id: 2, dataset_id: 2, class_name: 'sheep', class_index: 16 }),
    ];
    const asked: Array<string | null> = [];
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith('/ai/object-classes')) asked.push(url.searchParams.get('dataset_id'));
    });

    await mount('classes');
    expect(await screen.findByRole('button', { name: 'person' })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole('combobox', { name: /Filter by Dataset/ }), '2');

    expect(await screen.findByRole('button', { name: 'sheep' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'person' })).toBeNull();
    expect(asked).toContain('2');
  });

  it('edits a dataset through PATCH and refreshes the table', async () => {
    signIn();
    const sent: unknown[] = [];
    server.use(
      http.patch('/api/v3/ai/datasets/:id', async ({ request, params }) => {
        const body = (await request.json()) as Record<string, unknown>;
        sent.push(body);
        const row = db.aiDatasets.find((d) => d.id === Number(params.id))!;
        Object.assign(row, body);
        return HttpResponse.json(row);
      }),
    );
    await mount('datasets');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'COCO' }));
    const dialog = await screen.findByRole('dialog');
    const name = within(dialog).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'COCO 2017');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      name: 'COCO 2017',
      num_classes: 80,
      version: '2017',
      description: 'Microsoft Common Objects in Context',
    });
  });

  it('refuses to save a nameless dataset', async () => {
    signIn();
    await mount('datasets');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Add New Dataset' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Name is required');
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('creates an object class with the dataset the filter is on', async () => {
    signIn();
    const sent: unknown[] = [];
    server.use(
      http.post('/api/v3/ai/object-classes', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        sent.push(body);
        return HttpResponse.json(makeAiObjectClass({ id: 99, ...body }), { status: 201 });
      }),
    );
    await mount('classes');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Add New Class' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Class Name'), 'dog');
    const index = within(dialog).getByLabelText('Class Index');
    await user.clear(index);
    await user.type(index, '17');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ dataset_id: 1, class_name: 'dog', class_index: 17, description: null });
  });

  it('deletes the marked rows after confirming, and warns about the cascade', async () => {
    signIn();
    db.aiDatasets = [makeAiDataset({ id: 1 }), makeAiDataset({ id: 2, name: 'VOC' })];
    await mount('datasets');
    const user = userEvent.setup();

    await screen.findByRole('button', { name: 'COCO' });
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Mark VOC' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/object classes go with them/);
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(db.aiDatasets.map((d) => d.id)).toEqual([1]));
  });

  it('is read-only without System Edit', async () => {
    signIn(VIEWER);
    await mount('datasets');

    expect(await screen.findByText('COCO')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'COCO' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add New Dataset' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Mark COCO' })).toBeDisabled();
  });
});
