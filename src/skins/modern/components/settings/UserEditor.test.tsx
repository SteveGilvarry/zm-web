/**
 * The user create/edit dialog. Four tabs, but only two of them save on this
 * backend: Account (email + enabled, see zm-api#23) and the per-group /
 * per-monitor grids. These tests pin the request each control emits, the
 * fields the editor refuses to pretend it can save, and the self-edit mode
 * a non-admin gets on their own row.
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
      username: 'newop', password: 'secret', name: '', email: '', enabled: 1,
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
  it('titles itself after the user, fixes the username and locks the fields the API drops', () => {
    mount(OPS);
    expect(screen.getByRole('dialog', { name: 'Edit ops' })).toBeInTheDocument();
    expect(field('username')).toBeDisabled();
    expect(field('Not editable yet')).toBeDisabled();
    expect(field('Confirm password')).toBeDisabled();
    expect(field('Full name')).toBeDisabled();
    expect(field('Phone')).toBeDisabled();
    expect(field('user@example.com')).toBeEnabled();
    expect(field('Not editable yet')).toHaveAttribute(
      'title',
      'Not editable on this zm_api build — see zm-api#23',
    );
    expect(screen.getByRole('link', { name: 'zm-api#23' })).toHaveAttribute(
      'href',
      'https://github.com/SteveGilvarry/zm-api/issues/23',
    );
  });

  it('PUTs only email + enabled', async () => {
    const user = userEvent.setup();
    const seen = capture('put', '/api/v3/users/:id');
    const { onClose } = mount(OPS);

    await user.clear(field('user@example.com'));
    await user.type(field('user@example.com'), 'ops2@example.test');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(seen.body).toEqual({ email: 'ops2@example.test', enabled: 1 }));
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
    await waitFor(() => expect(seen.body).toEqual({ email: 'ops@example.test', enabled: 0 }));
  });

  it('shows the backend error and keeps the dialog open when the save fails', async () => {
    const user = userEvent.setup();
    server.use(http.put('/api/v3/users/:id', () =>
      HttpResponse.json({ error_message: 'user is read-only' }, { status: 500 })));
    const { onClose } = mount(OPS);

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(await screen.findByText('user is read-only')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('UserEditor — self edit', () => {
  it('offers the account fields only, with no tabs and no enable switch', () => {
    mount(OPS, 'self');
    expect(screen.queryByRole('button', { name: 'Global Permissions' })).not.toBeInTheDocument();
    expect(screen.getByText(/You are editing your own account/)).toBeInTheDocument();
    const toggle = screen.getByRole('switch', { name: 'Enabled' });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('title', 'Only an administrator can enable or disable accounts');
  });

  it('PUTs the email alone — enabled is not the user’s to change', async () => {
    const user = userEvent.setup();
    const seen = capture('put', '/api/v3/users/:id');
    mount(OPS, 'self');

    await user.clear(field('user@example.com'));
    await user.type(field('user@example.com'), 'me@example.test');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(seen.body).toEqual({ email: 'me@example.test' }));
  });
});

describe('UserEditor — Global Permissions tab', () => {
  it('renders the eight levels read-only, checked from the user record', async () => {
    const user = userEvent.setup();
    mount(OPS);
    await user.click(tab('Global Permissions'));

    expect(screen.getByText(/does not yet accept/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Monitors: View' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'System: None' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Stream: View' })).toBeChecked();
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
    // `monitors` is the only permission with a Create column.
    expect(screen.getByRole('radio', { name: 'Monitors: Create' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'System: Create' })).not.toBeInTheDocument();
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
