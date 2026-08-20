import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import type { Monitor } from '@/types';

const server = setupServer();
beforeAll(() => {
  // The Control tab fetches /api/v3/controls behind authedFetch, which reads
  // the access token from useAuthStore — provide a fake one so the request
  // gets through with an Authorization header attached.
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

// Mock TanStack Router's Link the same way MonitorEditor.test.tsx does — the
// editor doesn't render a Link, but importing it triggers the router's
// global setup which complains under jsdom.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={to ?? '#'} {...rest}>{children}</a>
  ),
}));

const { MonitorEditor } = await import('./MonitorEditor');

/** Baseline monitor used by every tab — every field referenced by the new
 *  tabs is present, so the editor's diff calc starts at zero. */
const monitor: Monitor = {
  id: 1,
  name: 'Front Door',
  notes: '',
  width: 1920,
  height: 1080,
  orientation: 'Rotate0',
  capturing: 'Always',
  analysing: 'Always',
  recording: 'OnMotion',
  function: 'Modect',
  type: 'Ffmpeg',

  // Timestamp tab
  label_format: '',
  label_x: 0,
  label_y: 0,
  label_size: 1,

  // ONVIF tab
  onvif_url: '',
  onvif_username: 'svc-zm',
  onvif_password: 'secret',
  onvif_options: '',
  onvif_event_listener: 0,
  use_onvif: 0,

  // Control tab
  controllable: 0,
  control_id: 0,
  control_device: '',
  control_address: '',
  auto_stop_timeout: null,
  track_motion: 0,
  track_delay: null,
  return_location: -1,
  return_delay: null,
  motion_tracker_id: null,
  modect_during_ptz: 0,

  // MQTT tab
  mqtt_enabled: 0,
  mqtt_subscriptions: '',
} as unknown as Monitor;

function openTab(label: RegExp) {
  return userEvent.setup().click(screen.getByRole('button', { name: label }));
}

/* ============================================================ */
/*  Timestamp tab                                               */
/* ============================================================ */

describe('MonitorEditor — Timestamp tab', () => {
  it('renders the four timestamp fields', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^timestamp$/i }));

    expect(screen.getByRole('heading', { name: /^timestamp$/i })).toBeInTheDocument();
    // Field labels live inside <span> elements; the help text repeats some
    // words, so query by exact label text to avoid duplicate matches.
    expect(screen.getByText('Timestamp label format')).toBeInTheDocument();
    expect(screen.getByText('Timestamp label X')).toBeInTheDocument();
    expect(screen.getByText('Timestamp label Y')).toBeInTheDocument();
    expect(screen.getByText('Font size')).toBeInTheDocument();
  });

  it('Font size dropdown lists the four legacy label sizes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^timestamp$/i }));

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toEqual(['Small', 'Default', 'Large', 'Extra Large']);
  });

  it('editing the label format propagates a dirty change to the footer', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^timestamp$/i }));

    // Find the label_format text input — it's the textbox under "Timestamp label format".
    const input = screen.getAllByRole('textbox')[0] as HTMLInputElement;
    await user.type(input, '%N %H:%M:%S');

    expect(screen.getByText(/unsaved change/i)).toBeInTheDocument();
  });

  it('Font size change PATCHes as a numeric value (not a stringified one)', async () => {
    const user = userEvent.setup();
    let captured: Record<string, unknown> | null = null;
    server.use(
      http.patch('/api/v3/monitors/1', async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...monitor, label_size: 2 });
      }),
    );

    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^timestamp$/i }));

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '2' } });

    await user.click(screen.getByRole('button', { name: /^save 1$/i }));
    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured).toEqual({ label_size: 2 });
  });
});

/* ============================================================ */
/*  ONVIF tab                                                   */
/* ============================================================ */

describe('MonitorEditor — ONVIF tab', () => {
  it('renders ONVIF URL, credentials, options, and the event-listener toggle', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^onvif$/i }));

    expect(screen.getByRole('heading', { name: /^onvif$/i })).toBeInTheDocument();
    expect(screen.getByText(/^onvif url$/i)).toBeInTheDocument();
    expect(screen.getByText(/^username$/i)).toBeInTheDocument();
    expect(screen.getByText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByText(/onvif options/i)).toBeInTheDocument();
    expect(screen.getByText(/onvif event listener/i)).toBeInTheDocument();
    // `use_onvif` is not a Monitor field (PATCH ignored it); it must not render.
    expect(screen.queryByText(/use onvif/i)).not.toBeInTheDocument();
  });

  it('password field is rendered as type="password"', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^onvif$/i }));

    // The password input has value 'secret' (from the fixture) but is not in
    // the textbox role tree (type=password). Query it by its display value.
    const inputs = document.querySelectorAll('input[type="password"]');
    expect(inputs).toHaveLength(1);
    expect((inputs[0] as HTMLInputElement).value).toBe('secret');
  });

  it('eye toggle reveals the password as type="text"', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^onvif$/i }));

    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(document.querySelectorAll('input[type="password"]')).toHaveLength(0);
    // Once unmasked the password is now in a textbox.
    expect(screen.getByDisplayValue('secret')).toBeInTheDocument();
  });

  it('toggling the event listener flips the switch state and registers a diff', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^onvif$/i }));

    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(1);
    await user.click(switches[0]);
    expect(switches[0]).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/unsaved change/i)).toBeInTheDocument();
  });
});

/* ============================================================ */
/*  Viewing tab                                                 */
/* ============================================================ */

describe('MonitorEditor — Viewing tab', () => {
  it('binds the Janus RTSP restream toggle to `restream` and PATCHes that key', async () => {
    let patched: Record<string, unknown> = {};
    server.use(http.patch('/api/v3/monitors/1', async ({ request }) => {
      patched = await request.json() as Record<string, unknown>;
      return HttpResponse.json({ ...monitor, ...patched });
    }));
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={{ ...monitor, restream: 0 }} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^viewing$/i }));

    // Switch order follows the field list: RTSP server, Janus WebRTC, Janus
    // audio, Janus RTSP restream, RTSP-to-Web.
    expect(screen.getByText('Janus RTSP restream')).toBeInTheDocument();
    await user.click(screen.getAllByRole('switch')[3]);
    await user.click(screen.getByRole('button', { name: /^save 1$/i }));

    await waitFor(() => expect(patched).toEqual({ restream: 1 }));
  });
});

/* ============================================================ */
/*  Control tab                                                 */
/* ============================================================ */

describe('MonitorEditor — Control tab', () => {
  const controlsFixture = [
    { id: 1, name: 'Hikvision ONVIF', protocol: 'onvif',  type: 'Ffmpeg' },
    { id: 2, name: 'Pelco-D',         protocol: 'pelco-d', type: 'Local' },
    { id: 3, name: 'Axis VAPIX',      protocol: 'vapix',  type: 'Ffmpeg' },
  ];

  it('renders the Controllable toggle and PTZ fields', async () => {
    const user = userEvent.setup();
    server.use(http.get('/api/v3/controls', () => HttpResponse.json({
      items: controlsFixture, total: 3, per_page: 200, current_page: 1, last_page: 1,
    })));

    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^control$/i }));

    expect(screen.getByRole('heading', { name: /^control$/i })).toBeInTheDocument();
    // Use exact-string queries — help text contains some of these phrases
    // verbatim and would create multi-match errors otherwise.
    expect(screen.getByText('Controllable')).toBeInTheDocument();
    expect(screen.getByText('Control type')).toBeInTheDocument();
    expect(screen.getByText('Control device')).toBeInTheDocument();
    expect(screen.getByText('Control address')).toBeInTheDocument();
    expect(screen.getByText('Auto stop timeout (s)')).toBeInTheDocument();
    expect(screen.getByText('Track motion')).toBeInTheDocument();
    expect(screen.getByText('Return location')).toBeInTheDocument();
  });

  it('Control type dropdown lists protocols fetched from /api/v3/controls', async () => {
    const user = userEvent.setup();
    server.use(http.get('/api/v3/controls', () => HttpResponse.json({
      items: controlsFixture, total: 3, per_page: 200, current_page: 1, last_page: 1,
    })));

    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^control$/i }));

    // Wait for the options to populate — the select starts disabled while
    // useQuery is fetching, then re-renders with controls.
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /hikvision onvif/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('option', { name: /pelco-d/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /axis vapix/i })).toBeInTheDocument();
    // "None" is always present as the zero-value sentinel.
    expect(screen.getByRole('option', { name: /^none$/i })).toBeInTheDocument();
  });

  it('selecting a control PATCHes control_id as a numeric FK', async () => {
    const user = userEvent.setup();
    let captured: Record<string, unknown> | null = null;
    server.use(
      http.get('/api/v3/controls', () => HttpResponse.json({
        items: controlsFixture, total: 3, per_page: 200, current_page: 1, last_page: 1,
      })),
      http.patch('/api/v3/monitors/1', async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...monitor, control_id: 2 });
      }),
    );

    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^control$/i }));

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /pelco-d/i })).toBeInTheDocument();
    });

    // The Control tab has two selects (Control type + Return location). Find
    // the Control type by the option list including "Pelco-D".
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    const controlTypeSelect = selects.find((s) =>
      Array.from(s.options).some((o) => /pelco-d/i.test(o.textContent ?? '')),
    );
    expect(controlTypeSelect).toBeDefined();
    fireEvent.change(controlTypeSelect!, { target: { value: '2' } });

    await user.click(screen.getByRole('button', { name: /^save 1$/i }));
    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured).toEqual({ control_id: 2 });
  });

  it('toggling Controllable on registers a diff on the tab badge', async () => {
    const user = userEvent.setup();
    server.use(http.get('/api/v3/controls', () => HttpResponse.json({
      items: controlsFixture, total: 3, per_page: 200, current_page: 1, last_page: 1,
    })));

    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^control$/i }));

    // The Controllable toggle is the first switch on the Control tab.
    const switches = screen.getAllByRole('switch');
    await user.click(switches[0]);

    const controlTab = screen.getByRole('button', { name: /^control/i });
    expect(controlTab.textContent).toContain('1');
  });
});

/* ============================================================ */
/*  MQTT tab                                                    */
/* ============================================================ */

describe('MonitorEditor — MQTT tab', () => {
  it('renders the enable toggle and the subscriptions textbox', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^mqtt$/i }));

    expect(screen.getByRole('heading', { name: /^mqtt$/i })).toBeInTheDocument();
    expect(screen.getByText('MQTT enabled')).toBeInTheDocument();
    expect(screen.getByText('MQTT subscriptions')).toBeInTheDocument();
  });

  it('hints that broker-wide settings live in Settings → Config', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^mqtt$/i }));

    expect(screen.getByText(/broker connection settings live in settings/i)).toBeInTheDocument();
  });

  it('typing in the subscriptions field marks it dirty', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^mqtt$/i }));

    const subsInput = screen.getByRole('textbox') as HTMLInputElement;
    await user.type(subsInput, 'home/sensors/#');
    expect(subsInput.value).toBe('home/sensors/#');
    expect(screen.getByText(/unsaved change/i)).toBeInTheDocument();
  });

  it('Save PATCHes only the MQTT keys that changed', async () => {
    const user = userEvent.setup();
    let captured: Record<string, unknown> | null = null;
    server.use(
      http.patch('/api/v3/monitors/1', async ({ request }) => {
        captured = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...monitor, mqtt_subscriptions: 'alarms/#' });
      }),
    );

    renderWithProviders(<MonitorEditor monitor={monitor} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /^mqtt$/i }));

    const subsInput = screen.getByRole('textbox') as HTMLInputElement;
    await user.type(subsInput, 'alarms/#');

    await user.click(screen.getByRole('button', { name: /^save 1$/i }));
    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured).toEqual({ mqtt_subscriptions: 'alarms/#' });
  });
});

// silence unused-import lint when reordering imports later
void openTab;
