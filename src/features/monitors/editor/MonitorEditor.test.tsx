import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
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

/* ------------------------------------------------------------------------ */
/*  Live-shaped record: raw DB enum casing                                  */
/* ------------------------------------------------------------------------ */

describe('MonitorEditor — record as the API returns it', () => {
  // Copied from GET /monitors/1 on the dev box: the response echoes the DB
  // strings (ROTATE_90, system, auto, WebRTC) while the request enums want
  // Rotate90 / System / Auto / WebRtc.
  const live = {
    ...monitor,
    orientation: 'ROTATE_90',
    event_close_mode: 'system',
    default_codec: 'auto',
    rtsp2_web_type: 'WebRTC',
    output_container: null,
    method: 'rtpRtsp',
    pass: 'hunter2',
    save_jpe_gs: 3,
    restream: 0,
  } as unknown as Monitor;

  it('starts clean and shows the stored Orientation, Method and Save JPEGs', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={live} onClose={() => {}} />);
    expect(screen.getByText(/no pending changes/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^source$/i }));
    expect((screen.getByDisplayValue('Rotate right (90°)') as HTMLSelectElement).value).toBe('Rotate90');
    expect((screen.getByDisplayValue('TCP') as HTMLSelectElement).value).toBe('rtpRtsp');
    const pass = screen.getByDisplayValue('hunter2') as HTMLInputElement;
    expect(pass.type).toBe('password');

    await user.click(screen.getByRole('button', { name: /^recording$/i }));
    expect((screen.getByDisplayValue('System') as HTMLSelectElement).value).toBe('System');
    expect((screen.getByDisplayValue('Frames + Analysis images') as HTMLSelectElement).value).toBe('3');
  });

  it('PATCHes only the changed key, in request casing', async () => {
    let patched: Record<string, unknown> = {};
    server.use(http.patch('/api/v3/monitors/1', async ({ request }) => {
      patched = await request.json() as Record<string, unknown>;
      return HttpResponse.json({ ...live, ...patched });
    }));
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={live} onClose={() => {}} />);

    await user.click(screen.getByRole('button', { name: /^source$/i }));
    fireEvent.change(screen.getByDisplayValue('Rotate right (90°)'), { target: { value: 'Rotate180' } });
    await user.click(screen.getByRole('button', { name: /^recording$/i }));
    fireEvent.change(screen.getByDisplayValue('Frames + Analysis images'), { target: { value: '1' } });
    await user.click(screen.getByRole('button', { name: /^save 2$/i }));

    await waitFor(() => expect(patched).toEqual({ orientation: 'Rotate180', save_jpe_gs: 1 }));
  });
});
