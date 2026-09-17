/**
 * The user create/edit dialog: the Account tab, the global permission grid
 * and the per-group / per-monitor grids. These tests pin the request each
 * control emits and the self-edit mode a non-admin gets on their own row.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { renderWithProviders } from '@/test/render';
import { setupMockServer, server, db } from '@/test/msw/server';
import { makeGroup, makeMonitor, makeUser, paginated } from '@/test/fixtures';
import { useToastStore } from '@/components/common/toastStore';
import type { User } from '@/types';
import { UserEditor } from './UserEditor';

setupMockServer();
afterEach(() => useToastStore.getState().clear());

const OPS: User = makeUser({
  id: 2,
  username: 'ops',
  name: 'Ops Person',
  email: 'ops@example.test',
  enabled: 1,
  monitors: 'View',
  system: 'None',
});

function mount(editing: User | null, mode?: 'admin' | 'self') {
  const onClose = vi.fn();
  const result = renderWithProviders(<UserEditor editing={editing} onClose={onClose} mode={mode} />);
  return { onClose, ...result };
}

const field = (placeholder: string) => screen.getByPlaceholderText(placeholder);
const tab = (name: string) => screen.getByRole('button', { name });

/** Capture the body of one request; `updateUser` uses PUT, not PATCH. */
function capture(method: 'put' | 'post' | 'patch' | 'delete', path: string) {
  const seen: { body?: unknown; url?: string } = {};
  server.use(
    http[method](path, async ({ request }) => {
      seen.url = request.url;
      seen.body = request.method === 'DELETE' ? null : await request.json();
      return HttpResponse.json({ id: 1 });
    }),
  );
  return seen;
}

describe('UserEditor — create', () => {
  it('opens as an account-only form with no tabs', () => {
    mount(null);
    expect(screen.getByRole('dialog', { name: 'Add User' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Global Permissions' })).not.toBeInTheDocument();
    expect(field('username')).toBeEnabled();
    expect(field('Password')).toBeEnabled();
    expect(
      screen.getByText(/New users are created with default permissions/),
    ).toBeInTheDocument();
  });

  it('refuses to submit until a username and a password are present', async () => {
    const user = userEvent.setup();
    mount(null);
    const submit = screen.getByRole('button', { name: 'Create User' });
    expect(submit).toBeDisabled();

    await user.type(field('username'), 'newop');
    expect(submit).toBeDisabled();

    await user.type(field('Password'), 'secret');
    expect(submit).toBeEnabled();
  });

  it('POSTs the full create payload', async () => {
    const user = userEvent.setup();
    const seen = capture('post', '/api/v3/users');
    const { onClose } = mount(null);

    await user.type(field('username'), 'newop');
    await user.type(field('Password'), 'secret');
    await user.type(field('Confirm password'), 'secret');
    await user.type(field('Full name'), 'New Op');
    await user.type(field('user@example.com'), 'newop@example.test');
    await user.type(field('Phone'), '555-0100');
    await user.click(screen.getByRole('button', { name: 'Create User' }));

    await waitFor(() => expect(seen.body).toEqual({
      username: 'newop',
      password: 'secret',
      name: 'New Op',
      email: 'newop@example.test',
      enabled: 1,
      phone: '555-0100',
      home_view: 'console',
      api_enabled: 1,
    }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('drops an omitted phone rather than sending an empty string', async () => {
    const user = userEvent.setup();
    const seen = capture('post', '/api/v3/users');
    mount(null);

    await user.type(field('username'), 'newop');
    await user.type(field('Password'), 'secret');
    await user.type(field('Confirm password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Create User' }));

    await waitFor(() => expect(seen.body).toEqual({
      username: 'newop', password: 'secret', name: '', email: '', enabled: 1, home_view: 'console', api_enabled: 1,
    }));
  });

  it('rejects a username with characters legacy would not accept', async () => {
    const user = userEvent.setup();
    mount(null);
    await user.type(field('username'), 'bad/name');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Username may only contain letters, digits, spaces, dots and @',
    );
    expect(field('username')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Create User' })).toBeDisabled();
  });

  it('blocks the create when the two passwords differ', async () => {
    const user = userEvent.setup();
    let posted = false;
    server.use(http.post('/api/v3/users', () => { posted = true; return HttpResponse.json({ id: 3 }); }));
    mount(null);

    await user.type(field('username'), 'newop');
    await user.type(field('Password'), 'secret');
    await user.type(field('Confirm password'), 'different');
    await user.click(screen.getByRole('button', { name: 'Create User' }));

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it('surfaces the backend message when the create fails', async () => {
    const user = userEvent.setup();
    server.use(http.post('/api/v3/users', () =>
      HttpResponse.json({ error_message: 'username already taken' }, { status: 409 })));
    const { onClose } = mount(null);

    await user.type(field('username'), 'admin');
    await user.type(field('Password'), 'secret');
    await user.type(field('Confirm password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Create User' }));

    expect(await screen.findByText('username already taken')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes without saving on Cancel', async () => {
    const user = userEvent.setup();
    const { onClose } = mount(null);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('UserEditor — edit (admin)', () => {
  it('titles itself after the user, fixes the username and frees everything else', () => {
    mount(OPS);
    expect(screen.getByRole('dialog', { name: 'Edit ops' })).toBeInTheDocument();
    expect(field('username')).toBeDisabled();
    expect(field('Leave blank to keep')).toBeEnabled();
    expect(field('Confirm password')).toBeEnabled();
    expect(field('Full name')).toBeEnabled();
    expect(field('Phone')).toBeEnabled();
    expect(field('user@example.com')).toBeEnabled();
    expect(screen.getByLabelText('Language')).toHaveValue('');
    expect(screen.getByLabelText('Home View')).toHaveValue('console');
    expect(screen.getByRole('switch', { name: 'API Enabled' })).toHaveAttribute('aria-checked', 'true');
  });

  it('PUTs only the fields that changed', async () => {
    const user = userEvent.setup();
    const seen = capture('put', '/api/v3/users/:id');
    const { onClose } = mount(OPS);

    await user.clear(field('user@example.com'));
    await user.type(field('user@example.com'), 'ops2@example.test');
    await user.type(field('Leave blank to keep'), 'hunter22');
    await user.type(field('Confirm password'), 'hunter22');
    await user.selectOptions(screen.getByLabelText('Language'), 'de_de');
    await user.selectOptions(screen.getByLabelText('Home View'), 'montage');
    await user.click(screen.getByRole('switch', { name: 'API Enabled' }));
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(seen.body).toEqual({
      email: 'ops2@example.test', password: 'hunter22', language: 'de_de', home_view: 'montage', api_enabled: 0,
    }));
    expect(seen.url).toContain('/api/v3/users/2');
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('sends enabled: 0 after the switch is turned off', async () => {
    const user = userEvent.setup();
    const seen = capture('put', '/api/v3/users/:id');
    mount(OPS);

    const toggle = screen.getByRole('switch', { name: 'Enabled' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(seen.body).toEqual({ enabled: 0 }));
  });

  it('shows the backend error and keeps the dialog open when the save fails', async () => {
    const user = userEvent.setup();
    server.use(http.put('/api/v3/users/:id', () =>
      HttpResponse.json({ error_message: 'user is read-only' }, { status: 500 })));
    const { onClose } = mount(OPS);

    await user.type(field('Full name'), '!');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(await screen.findByText('user is read-only')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('UserEditor — self edit', () => {
  it('offers password, language and home view; the rest is admin-only', () => {
    mount(OPS, 'self');
    expect(screen.queryByRole('button', { name: 'Global Permissions' })).not.toBeInTheDocument();
    expect(screen.getByText(/You are editing your own account/)).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Enabled' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'API Enabled' })).not.toBeInTheDocument();
    expect(field('Leave blank to keep')).toBeEnabled();
    expect(screen.getByLabelText('Language')).toBeEnabled();
    expect(screen.getByLabelText('Home View')).toBeEnabled();
    for (const f of ['Full name', 'user@example.com', 'Phone']) {
      expect(field(f)).toBeDisabled();
      expect(field(f)).toHaveAttribute('title', 'Only an administrator can change this');
    }
  });

  it('PUTs the language and home view alone', async () => {
    const user = userEvent.setup();
    const seen = capture('put', '/api/v3/users/:id');
    mount(OPS, 'self');

    await user.selectOptions(screen.getByLabelText('Language'), 'fr_fr');
    await user.selectOptions(screen.getByLabelText('Home View'), 'watch');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(seen.body).toEqual({ language: 'fr_fr', home_view: 'watch' }));
  });
});

describe('UserEditor — Global Permissions tab', () => {
  it('renders the eight levels editable, checked from the user record', async () => {
    const user = userEvent.setup();
    mount(OPS);
    await user.click(tab('Global Permissions'));

    expect(screen.getByRole('radio', { name: 'Monitors: View' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'System: None' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Stream: View' })).toBeChecked();
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeEnabled();
    // `monitors` is the only permission with a Create column.
    expect(screen.getByRole('radio', { name: 'Monitors: Create' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'System: Create' })).not.toBeInTheDocument();
  });

  it('PUTs the one level that changed and keeps it once the backend confirms', async () => {
    const user = userEvent.setup();
    const bodies: unknown[] = [];
    server.use(http.put('/api/v3/users/:id', async ({ request }) => {
      const body = await request.json() as Record<string, string>;
      bodies.push(body);
      return HttpResponse.json({ ...OPS, ...body });
    }));
    mount(OPS);
    await user.click(tab('Global Permissions'));

    await user.click(screen.getByRole('radio', { name: 'Monitors: Create' }));
    await waitFor(() => expect(bodies).toEqual([{ monitors: 'Create' }]));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Monitors: Create' })).toBeChecked());
  });

  it('snaps the radio back when the backend refuses the level', async () => {
    const user = userEvent.setup();
    server.use(http.put('/api/v3/users/:id', () =>
      HttpResponse.json({ error_message: 'bad level' }, { status: 422 })));
    mount(OPS);
    await user.click(tab('Global Permissions'));

    await user.click(screen.getByRole('radio', { name: 'System: Edit' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: 'System: None' })).toBeChecked());
    expect(useToastStore.getState().toasts[0]?.tone).toBe('error');
  });
});

describe('UserEditor — Groups tab', () => {
  it('lists the group tree with its monitors and creates a missing override', async () => {
    const user = userEvent.setup();
    const seen = capture('post', '/api/v3/groups-permissions');
    mount(OPS);
    await user.click(tab('Groups'));

    const outdoor = await screen.findByRole('radio', { name: 'Outdoor: Inherit' });
    expect(outdoor).toBeChecked();
    expect(screen.getByText('Front Door')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Front Yard: Inherit' })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: 'Outdoor: Edit' }));
    await waitFor(() => expect(seen.body).toEqual({ group_id: 1, user_id: 2, permission: 'Edit' }));
  });

  it('PATCHes an existing override, and DELETEs it when set back to Inherit', async () => {
    const user = userEvent.setup();
    server.use(http.get('/api/v3/groups-permissions', () =>
      HttpResponse.json(paginated([{ id: 77, group_id: 1, user_id: 2, permission: 'View' }]))));
    const patched = capture('patch', '/api/v3/groups-permissions/:id');
    mount(OPS);
    await user.click(tab('Groups'));

    expect(await screen.findByRole('radio', { name: 'Outdoor: View' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Outdoor: Edit' }));
    await waitFor(() => expect(patched.body).toEqual({ permission: 'Edit' }));
    expect(patched.url).toContain('/groups-permissions/77');

    const deleted = capture('delete', '/api/v3/groups-permissions/:id');
    await user.click(screen.getByRole('radio', { name: 'Outdoor: Inherit' }));
    await waitFor(() => expect(deleted.url).toContain('/groups-permissions/77'));
  });

  it('says so when the install has no groups', async () => {
    const user = userEvent.setup();
    db.groups = [];
    mount(OPS);
    await user.click(tab('Groups'));
    expect(await screen.findByText(/No groups defined/)).toBeInTheDocument();
  });
});

describe('UserEditor — Monitors tab', () => {
  it('lists each monitor with its effective level and creates an override', async () => {
    const user = userEvent.setup();
    const seen = capture('post', '/api/v3/monitors-permissions');
    mount(OPS);
    await user.click(tab('Monitors'));

    const front = await screen.findByRole('radio', { name: 'Front Door: Inherit' });
    expect(front).toBeChecked();
    // Effective = global `monitors` (View) because nothing overrides it.
    const row = front.closest('tr') as HTMLTableRowElement;
    expect(within(row).getByText('View')).toBeInTheDocument();
    expect(within(row).getByText('#1')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Driveway: None' }));
    await waitFor(() => expect(seen.body).toEqual({ monitor_id: 2, user_id: 2, permission: 'None' }));
  });

  it('shows the override winning over the global level in the Effective column', async () => {
    const user = userEvent.setup();
    server.use(http.get('/api/v3/monitors-permissions', () =>
      HttpResponse.json(paginated([{ id: 9, monitor_id: 1, user_id: 2, permission: 'Edit' }]))));
    mount(OPS);
    await user.click(tab('Monitors'));

    const front = await screen.findByRole('radio', { name: 'Front Door: Edit' });
    expect(front).toBeChecked();
    expect(within(front.closest('tr') as HTMLTableRowElement).getByText('Edit')).toBeInTheDocument();
  });

  it('hides deleted monitors and says so when nothing is left', async () => {
    const user = userEvent.setup();
    db.monitors = [makeMonitor({ id: 5, name: 'Retired', deleted: 1 })];
    mount(OPS);
    await user.click(tab('Monitors'));
    expect(await screen.findByText('No monitors.')).toBeInTheDocument();
    expect(screen.queryByText('Retired')).not.toBeInTheDocument();
  });
});

describe('UserEditor — tab navigation', () => {
  it('keeps the account form mounted only while its tab is selected', async () => {
    const user = userEvent.setup();
    db.groups = [makeGroup({ id: 1, name: 'Outdoor' })];
    mount(OPS);

    await user.click(tab('Groups'));
    expect(screen.queryByPlaceholderText('username')).not.toBeInTheDocument();

    await user.click(tab('Account'));
    expect(screen.getByPlaceholderText('username')).toBeInTheDocument();
  });
});
