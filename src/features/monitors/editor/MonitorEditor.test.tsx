import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import type { Monitor } from '@/types';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Mock TanStack Router's Link for the same reason as MonitorThumbnail tests.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={to ?? '#'} {...rest}>{children}</a>
  ),
}));

const { MonitorEditor } = await import('./MonitorEditor');

const monitor: Monitor = {
  id: 1,
  name: 'Front Door',
  notes: 'driveway-facing',
  width: 1920,
  height: 1080,
  orientation: 'Rotate0',
  capturing: 'Always',
  analysing: 'Always',
  recording: 'OnMotion',
  function: 'Modect',
  type: 'Ffmpeg',
  host: '192.168.1.10',
  port: '554',
  path: '/Streaming/Channels/101',
} as unknown as Monitor;

describe('MonitorEditor — diff tracking', () => {
  it('shows "No pending changes" on initial mount', () => {
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    expect(screen.getByText(/no pending changes/i)).toBeInTheDocument();
  });

  it('flips to an "unsaved changes" badge as soon as a field edits', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);

    const nameInput = screen.getByDisplayValue('Front Door');
    await user.tripleClick(nameInput);
    await user.keyboard('Front Door (renamed)');

    expect(screen.getByText(/1 unsaved change/i)).toBeInTheDocument();
    // Save button label echoes the count.
    expect(screen.getByRole('button', { name: /^save 1$/i })).toBeInTheDocument();
  });

  it('shows a per-tab badge for changes in that tab', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);

    const nameInput = screen.getByDisplayValue('Front Door');
    await user.tripleClick(nameInput);
    await user.keyboard('Updated');

    // General tab gets a "1" badge on its left-rail entry.
    const generalTab = screen.getByRole('button', { name: /general/i });
    expect(generalTab.textContent).toContain('1');
  });

  it('Reset clears all pending changes back to baseline', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);

    const nameInput = screen.getByDisplayValue('Front Door');
    await user.tripleClick(nameInput);
    await user.keyboard('Renamed');

    expect(screen.getByText(/1 unsaved change/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /reset/i }));
    expect(screen.getByText(/no pending changes/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Front Door')).toBeInTheDocument();
  });
});

describe('MonitorEditor — save', () => {
  it('PATCHes only changed keys, not the whole monitor', async () => {
    const user = userEvent.setup();
    let captured: Record<string, unknown> | null = null;
    server.use(
      http.patch('/api/v3/monitors/1', async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...monitor, name: 'New Name' });
      }),
    );

    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    const nameInput = screen.getByDisplayValue('Front Door');
    await user.tripleClick(nameInput);
    await user.keyboard('New Name');

    await user.click(screen.getByRole('button', { name: /^save 1$/i }));

    // PATCH body must contain ONLY the changed field, not the rest.
    expect(captured).toBeDefined();
    expect(captured!).toEqual({ name: 'New Name' });
  });
});

describe('MonitorEditor — discard confirmation', () => {
  it('prompts before closing with unsaved changes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderWithProviders(<MonitorEditor monitor={monitor} onClose={onClose} />);
    const nameInput = screen.getByDisplayValue('Front Door');
    await user.tripleClick(nameInput);
    await user.keyboard('Renamed');

    await user.click(screen.getByRole('button', { name: /close/i }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled(); // user declined the discard
    confirmSpy.mockRestore();
  });

  it('closes without prompt when there are no changes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm');

    renderWithProviders(<MonitorEditor monitor={monitor} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /close/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
    confirmSpy.mockRestore();
  });
});

describe('MonitorEditor — tab navigation', () => {
  it('switches the form pane to the clicked tab', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);

    // Initially on General — title says "General".
    expect(screen.getByRole('heading', { name: /^general$/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^source$/i }));
    expect(screen.getByRole('heading', { name: /^source$/i })).toBeInTheDocument();
  });
});

// silence unused-import lint when imports are reordered later
void fireEvent;
