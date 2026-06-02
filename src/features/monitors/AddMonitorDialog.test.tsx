import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { AddMonitorDialog } from './AddMonitorDialog';
import { useAuthStore } from '@/stores/auth';

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'warn' });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

describe('AddMonitorDialog — visibility', () => {
  it('renders nothing when open=false', () => {
    const { container } = renderWithProviders(
      <AddMonitorDialog open={false} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the dialog when open=true', () => {
    renderWithProviders(
      <AddMonitorDialog open={true} onClose={() => {}} />,
    );
    expect(screen.getByRole('dialog', { name: /add monitor/i })).toBeInTheDocument();
  });
});

describe('AddMonitorDialog — form validation', () => {
  it('disables the submit button while the name is empty', () => {
    renderWithProviders(
      <AddMonitorDialog open={true} onClose={() => {}} />,
    );
    expect(screen.getByRole('button', { name: /create monitor/i })).toBeDisabled();
  });

  it('enables the submit button as soon as the name has content', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AddMonitorDialog open={true} onClose={() => {}} />,
    );

    const nameInput = screen.getByPlaceholderText(/front door/i);
    await user.type(nameInput, 'New Camera');

    expect(screen.getByRole('button', { name: /create monitor/i })).toBeEnabled();
  });
});

describe('AddMonitorDialog — submit', () => {
  it('POSTs /monitors with the form values + spreads defaults', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    let body: Record<string, unknown> = {};

    server.use(
      http.post('/api/v3/monitors', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 42 });
      }),
    );

    renderWithProviders(
      <AddMonitorDialog open={true} onClose={onClose} />,
    );

    await user.type(screen.getByPlaceholderText(/front door/i), 'Garage');
    await user.click(screen.getByRole('button', { name: /create monitor/i }));

    await waitFor(() => expect(body.name).toBe('Garage'));
    // Defaults were spread in (random representative check).
    expect(body.image_buffer_count).toBeDefined();
    expect(body.section_length).toBeDefined();
  });

  it('closes the dialog after a successful create', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    server.use(
      http.post('/api/v3/monitors', () => HttpResponse.json({ id: 42 })),
    );

    renderWithProviders(
      <AddMonitorDialog open={true} onClose={onClose} />,
    );
    await user.type(screen.getByPlaceholderText(/front door/i), 'Garage');
    await user.click(screen.getByRole('button', { name: /create monitor/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('surfaces a backend error and stays open', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    server.use(
      http.post('/api/v3/monitors', () =>
        HttpResponse.json({ message: 'monitor name already taken' }, { status: 400 }),
      ),
    );

    renderWithProviders(
      <AddMonitorDialog open={true} onClose={onClose} />,
    );
    await user.type(screen.getByPlaceholderText(/front door/i), 'Dup');
    await user.click(screen.getByRole('button', { name: /create monitor/i }));

    // Error caption rendered; dialog still open (onClose not called).
    await waitFor(() => expect(screen.getByText(/already taken/i)).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('AddMonitorDialog — close button', () => {
  it('calls onClose without submitting when the X is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(
      <AddMonitorDialog open={true} onClose={onClose} />,
    );
    await user.click(screen.getByRole('button', { name: /^close$/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
