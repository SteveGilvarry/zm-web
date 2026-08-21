/**
 * Settings → Users through the real router.
 *
 * `settings.users.test.tsx` mounts the page with a stubbed router and
 * covers the list and its search. This file drives the controls that need
 * the real one: the `?uid=` editor round-trip, the enable toggle and delete
 * requests, the bulk selection, the CSV / JSON exports, and the `system`
 * permission gate.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { renderRoute } from '@/test/renderRoute';
import { setupMockServer, server, db } from '@/test/msw/server';
import { makeUser } from '@/test/fixtures';

setupMockServer();

/** The signed-in admin (uid 1) plus two rows an admin may act on. */
function seedUsers() {
  db.users = [
    makeUser({ id: 1, username: 'admin', name: 'Administrator' }),
    makeUser({
      id: 2,
      username: 'operator',
      name: 'Ops Team',
      email: 'ops@example.test',
      system: 'View',
      control: 'None',
    }),
    makeUser({ id: 3, username: 'viewer', name: 'Read Only', email: 'ro@example.test', enabled: 0, system: 'None' }),
  ];
}

async function usersPage() {
  await screen.findAllByRole('heading', { name: /^User Management$/ });
}

/** Capture the text of the file the export buttons hand to the browser. */
function captureDownload() {
  const saved: Array<{ name: string; blob: Blob }> = [];
  let pending: Blob | null = null;
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    pending = blob as Blob;
    return 'blob:mock';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    if (pending) saved.push({ name: this.download, blob: pending });
    pending = null;
  });
  return saved;
}

describe('Settings → Users — list', () => {
  it('lists every account with its permission columns', async () => {
    seedUsers();
    renderRoute('/settings/users');
    await usersPage();

    expect(await screen.findByText('operator')).toBeInTheDocument();
    expect(screen.getByText('Ops Team')).toBeInTheDocument();
    expect(screen.getByText('ops@example.test')).toBeInTheDocument();
    // The signed-in account is marked and cannot be deleted.
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete admin' })).toBeDisabled();
  });

  it('shows an empty state when the backend has no users', async () => {
    db.users = [];
    renderRoute('/settings/users');
    await usersPage();
    expect(await screen.findByText('No users found')).toBeInTheDocument();
  });

  it('shows the error state when the list request fails', async () => {
    server.use(http.get('/api/v3/users', () => new HttpResponse(null, { status: 500 })));
    renderRoute('/settings/users');
    await usersPage();
    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('narrows the list by search and says so when nothing matches', async () => {
    seedUsers();
    const user = userEvent.setup();
    renderRoute('/settings/users');
    await usersPage();
    await screen.findByText('operator');

    const box = screen.getByLabelText('Search users');
    await user.type(box, 'ops@');
    expect(await screen.findByText('operator')).toBeInTheDocument();
    expect(screen.queryByText('viewer')).not.toBeInTheDocument();

    await user.clear(box);
    await user.type(box, 'nobody');
    expect(await screen.findByText('No users match your search')).toBeInTheDocument();
  });
});

describe('Settings → Users — editor', () => {
  it('opens the editor from the username and records it in ?uid=', async () => {
    seedUsers();
    const user = userEvent.setup();
    const { router } = renderRoute('/settings/users');
    await usersPage();

    await user.click(await screen.findByRole('button', { name: 'operator' }));

    await waitFor(() => expect(router.state.location.search).toEqual({ uid: 2 }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Edit operator' })).toBeInTheDocument();
  });

  it('opens the same editor from the row’s pencil', async () => {
    seedUsers();
    const user = userEvent.setup();
    const { router } = renderRoute('/settings/users');
    await usersPage();

    await user.click(await screen.findByRole('button', { name: 'Edit viewer' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ uid: 3 }));
    expect(await screen.findByRole('heading', { name: 'Edit viewer' })).toBeInTheDocument();
  });

  it('opens the create form from Add User and drops ?uid= again on close', async () => {
    seedUsers();
    const user = userEvent.setup();
    const { router } = renderRoute('/settings/users');
    await usersPage();

    await user.click(await screen.findByRole('button', { name: 'Add User' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ uid: 0 }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Add User' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /close/i }));
    await waitFor(() => expect(router.state.location.search).toEqual({}));
  });

  it('opens the editor straight from a ?uid= deep link', async () => {
    seedUsers();
    renderRoute('/settings/users?uid=2');
    await usersPage();
    expect(await screen.findByRole('heading', { name: 'Edit operator' })).toBeInTheDocument();
  });
});

describe('Settings → Users — mutations', () => {
  it('flips a user’s enabled flag with a PUT of just that column', async () => {
    seedUsers();
    const puts: Array<{ id: string; body: unknown }> = [];
    server.use(
      http.put('/api/v3/users/:id', async ({ request, params }) => {
        puts.push({ id: String(params.id), body: await request.json() });
        return HttpResponse.json(makeUser({ id: Number(params.id), enabled: 0 }));
      }),
    );

    const user = userEvent.setup();
    renderRoute('/settings/users');
    await usersPage();

    await user.click(await screen.findByRole('switch', { name: 'Disable operator' }));
    await waitFor(() => expect(puts).toEqual([{ id: '2', body: { enabled: 0 } }]));
  });

  it('enables a disabled user', async () => {
    seedUsers();
    const puts: Array<{ id: string; body: unknown }> = [];
    server.use(
      http.put('/api/v3/users/:id', async ({ request, params }) => {
        puts.push({ id: String(params.id), body: await request.json() });
        return HttpResponse.json(makeUser({ id: Number(params.id), enabled: 1 }));
      }),
    );

    const user = userEvent.setup();
    renderRoute('/settings/users');
    await usersPage();

    await user.click(await screen.findByRole('switch', { name: 'Enable viewer' }));
    await waitFor(() => expect(puts).toEqual([{ id: '3', body: { enabled: 1 } }]));
  });

  it('confirms before deleting one row, then DELETEs it', async () => {
    seedUsers();
    const deleted: string[] = [];
    server.use(
      http.delete('/api/v3/users/:id', ({ params }) => {
        deleted.push(String(params.id));
        return HttpResponse.json({ message: 'deleted' });
      }),
    );

    const user = userEvent.setup();
    renderRoute('/settings/users');
    await usersPage();

    await user.click(await screen.findByRole('button', { name: 'Delete operator' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Are you sure you want to delete user "operator"?');
    expect(deleted).toEqual([]);

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleted).toEqual(['2']));
  });

  it('keeps the row when the delete confirm is cancelled', async () => {
    seedUsers();
    const deleted: string[] = [];
    server.use(
      http.delete('/api/v3/users/:id', ({ params }) => {
        deleted.push(String(params.id));
        return HttpResponse.json({ message: 'deleted' });
      }),
    );

    const user = userEvent.setup();
    renderRoute('/settings/users');
    await usersPage();

    await user.click(await screen.findByRole('button', { name: 'Delete operator' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(deleted).toEqual([]);
  });

  it('deletes a checked selection in bulk, never the signed-in account', async () => {
    seedUsers();
    const deleted: string[] = [];
    server.use(
      http.delete('/api/v3/users/:id', ({ params }) => {
        deleted.push(String(params.id));
        return HttpResponse.json({ message: 'deleted' });
      }),
    );

    const user = userEvent.setup();
    renderRoute('/settings/users');
    await usersPage();

    expect(await screen.findByLabelText('Mark admin')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete selected (0)' })).toBeDisabled();

    await user.click(screen.getByLabelText('Select all'));
    expect(screen.getByRole('button', { name: 'Delete selected (2)' })).toBeEnabled();

    await user.click(screen.getByLabelText('Mark viewer'));
    await user.click(screen.getByRole('button', { name: 'Delete selected (1)' }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleted).toEqual(['2']));
  });
});

describe('Settings → Users — export', () => {
  it('exports the matching users as CSV in legacy column order', async () => {
    seedUsers();
    const saved = captureDownload();

    const user = userEvent.setup();
    renderRoute('/settings/users');
    await usersPage();
    await screen.findByText('operator');

    await user.click(screen.getByRole('button', { name: 'Export CSV' }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].name).toMatch(/^users-\d{4}-\d{2}-\d{2}\.csv$/);
    const text = await saved[0].blob.text();
    expect(text.split('\r\n')[0]).toBe(
      'id,username,name,email,enabled,stream,events,control,monitors,groups,devices,snapshots,system',
    );
    expect(text).toContain('2,operator,Ops Team,ops@example.test,1');
  });

  it('exports the same rows as JSON', async () => {
    seedUsers();
    const saved = captureDownload();

    const user = userEvent.setup();
    renderRoute('/settings/users');
    await usersPage();
    await screen.findByText('operator');

    await user.click(screen.getByRole('button', { name: 'Export JSON' }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].name).toMatch(/\.json$/);
    const rows = JSON.parse(await saved[0].blob.text()) as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.username)).toEqual(['admin', 'operator', 'viewer']);
    expect(rows[1]).toMatchObject({ id: 2, system: 'View', control: 'None' });
  });
});

describe('Settings → Users — permissions', () => {
  it('turns the page into a read-only list for an operator with only View', async () => {
    seedUsers();
    renderRoute('/settings/users', { perms: { system: 'View' } });
    await usersPage();

    expect(await screen.findByText('operator')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add User' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete selected/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete operator' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Select all')).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Disable operator' })).toBeDisabled();
    // Export is a read of what is already on screen, so it stays.
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
  });

  it('hides the whole panel from an operator with no system permission', async () => {
    seedUsers();
    renderRoute('/settings/users', { perms: { system: 'None' } });
    await usersPage();

    expect(await screen.findByText('You do not have permission to view this.')).toBeInTheDocument();
    expect(screen.queryByText('operator')).not.toBeInTheDocument();
  });
});
