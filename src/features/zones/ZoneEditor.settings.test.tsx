/**
 * ZoneEditor — the motion-settings half of the form: what the zone's Type and
 * Check Method leave editable (legacy's `applyZoneType` / `applyCheckMethod`)
 * and what reaches the wire on save.
 */
import { describe, expect, it, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import { ZoneEditor } from './ZoneEditor';
import { useToastStore } from '@/components/common/toastStore';

vi.mock('@/hooks/useRefreshingSnapshot', () => ({ useRefreshingSnapshot: () => null }));

const paged = (items: unknown[]) =>
  HttpResponse.json({ items, total: items.length, per_page: 50, current_page: 1, last_page: 1 });

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({ accessToken: 't', refreshToken: 't', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
beforeEach(() => {
  server.use(http.get('/api/v3/zone-presets', () => paged([])));
});
afterEach(() => {
  server.resetHandlers();
  useToastStore.getState().clear();
});
afterAll(() => {
  server.close();
  useAuthStore.getState().clearAuth();
});

/** A Blobs zone with every settings column populated, as the box returns it. */
const BLOBS_ZONE = {
  id: 7, monitor_id: 1, name: 'Driveway', type: 'Active', units: 'Pixels',
  coords: '100,100 500,100 500,400 100,400', num_coords: 4, area: 120000,
  check_method: 'Blobs', alarm_rgb: 16711680,
  min_pixel_threshold: 25, max_pixel_threshold: null,
  min_alarm_pixels: 100, max_alarm_pixels: 9000,
  filter_x: 3, filter_y: 3,
  min_filter_pixels: 90, max_filter_pixels: 8000,
  min_blob_pixels: 80, max_blob_pixels: 7000,
  min_blobs: 1, max_blobs: 4,
  overload_frames: 2, extend_alarm_frames: 0,
};

function stub(zone: Record<string, unknown> = BLOBS_ZONE) {
  server.use(http.get('/api/v3/monitors/1/zones', () => paged([zone])));
}

/** Captures the one write the editor makes. */
function captureSave() {
  const sent: { method: string; body: Record<string, unknown> }[] = [];
  server.use(
    http.put('/api/v3/zones/:id', async ({ request }) => {
      sent.push({ method: 'PUT', body: await request.json() as Record<string, unknown> });
      return HttpResponse.json(BLOBS_ZONE);
    }),
    http.post('/api/v3/monitors/1/zones', async ({ request }) => {
      sent.push({ method: 'POST', body: await request.json() as Record<string, unknown> });
      return HttpResponse.json(BLOBS_ZONE, { status: 201 });
    }),
  );
  return sent;
}

function mount() {
  return renderWithProviders(<ZoneEditor monitorId={1} width={1920} height={1080} />);
}

async function openZone(user: ReturnType<typeof userEvent.setup>, name = 'Driveway') {
  mount();
  await waitFor(() => screen.getByText(name));
  await user.click(screen.getByText(name));
  await waitFor(() => screen.getByLabelText('Check Method'));
}

describe('ZoneEditor — motion settings', () => {
  it('loads every stored setting into the form', async () => {
    const user = userEvent.setup();
    stub();
    await openZone(user);

    expect(screen.getByLabelText('Check Method')).toHaveValue('Blobs');
    expect(screen.getByLabelText('Alarm Colour')).toHaveValue('#ff0000');
    expect(screen.getByLabelText('Min/Max Pixel Threshold (min)')).toHaveValue(25);
    // A null column comes back as an empty box, never as 0.
    expect(screen.getByLabelText('Min/Max Pixel Threshold (max)')).toHaveValue(null);
    expect(screen.getByLabelText('Min/Max Blobs (max)')).toHaveValue(4);
    expect(screen.getByLabelText('Overload Frame Ignore Count')).toHaveValue(2);
  });

  it('sends the edited settings on save', async () => {
    const user = userEvent.setup();
    stub();
    const sent = captureSave();
    await openZone(user);

    const minBlobs = screen.getByLabelText('Min/Max Blobs (min)');
    await user.clear(minBlobs);
    await user.type(minBlobs, '3');
    // Clearing a box clears the column rather than keeping the old number.
    await user.clear(screen.getByLabelText('Min/Max Blob Area (max)'));
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].method).toBe('PUT');
    expect(sent[0].body).toMatchObject({
      check_method: 'Blobs',
      min_blobs: 3,
      max_blob_pixels: null,
      filter_x: 3,
      min_filter_pixels: 90,
      alarm_rgb: 16711680,
    });
  });

  it('disables the filter and blob rows for AlarmedPixels, and omits them on save', async () => {
    const user = userEvent.setup();
    stub();
    const sent = captureSave();
    await openZone(user);

    await user.selectOptions(screen.getByLabelText('Check Method'), 'AlarmedPixels');
    expect(screen.getByLabelText('Filter Width/Height (min)')).toBeDisabled();
    expect(screen.getByLabelText('Min/Max Filtered Area (min)')).toBeDisabled();
    expect(screen.getByLabelText('Min/Max Blobs (min)')).toBeDisabled();
    // The alarm rows stay on whatever the method is.
    expect(screen.getByLabelText('Min/Max Alarmed Area (min)')).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(sent).toHaveLength(1));
    // Not sent means not changed — the columns keep what they hold.
    expect(sent[0].body).not.toHaveProperty('filter_x');
    expect(sent[0].body).not.toHaveProperty('min_blobs');
    expect(sent[0].body).toHaveProperty('min_alarm_pixels', 100);
  });

  it('reveals the filter rows but not the blob rows for FilteredPixels', async () => {
    const user = userEvent.setup();
    stub();
    await openZone(user);

    await user.selectOptions(screen.getByLabelText('Check Method'), 'FilteredPixels');
    expect(screen.getByLabelText('Filter Width/Height (min)')).toBeEnabled();
    expect(screen.getByLabelText('Min/Max Filtered Area (max)')).toBeEnabled();
    expect(screen.getByLabelText('Min/Max Blob Area (min)')).toBeDisabled();
  });

  it('turns every setting off for an Inactive zone', async () => {
    const user = userEvent.setup();
    stub();
    const sent = captureSave();
    await openZone(user);

    await user.selectOptions(screen.getByLabelText('Type'), 'Inactive');
    expect(screen.getByLabelText('Check Method')).toBeDisabled();
    expect(screen.getByLabelText('Alarm Colour')).toBeDisabled();
    expect(screen.getByLabelText('Min/Max Pixel Threshold (min)')).toBeDisabled();
    expect(screen.getByLabelText('Overload Frame Ignore Count')).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(sent).toHaveLength(1));
    // Geometry and identity only; nothing that would wipe the stored settings.
    expect(Object.keys(sent[0].body).sort()).toEqual(['coords', 'name', 'type', 'units']);
  });

  it('gives Preclusive Extend Alarm Frames and takes away its alarm colour', async () => {
    const user = userEvent.setup();
    stub();
    await openZone(user);

    expect(screen.getByLabelText('Extend Alarm Frame Count')).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Type'), 'Preclusive');
    expect(screen.getByLabelText('Extend Alarm Frame Count')).toBeEnabled();
    expect(screen.getByLabelText('Alarm Colour')).toBeDisabled();
  });

  it('labels the area thresholds in the zone\'s own units', async () => {
    const user = userEvent.setup();
    stub({ ...BLOBS_ZONE, units: 'Percent' });
    await openZone(user);

    // A Percent zone caps its area thresholds at 100.
    expect(screen.getByLabelText('Min/Max Alarmed Area (min)')).toHaveAttribute('max', '100');
    // A pixel-difference threshold is not an area, so it keeps its 0-255 range.
    expect(screen.getByLabelText('Min/Max Pixel Threshold (min)')).toHaveAttribute('max', '255');
  });

  it('creates a zone with the settings the form shows', async () => {
    const user = userEvent.setup();
    stub();
    const sent = captureSave();
    mount();
    await waitFor(() => screen.getByText('Driveway'));
    await user.click(screen.getByRole('button', { name: /new/i }));
    await waitFor(() => screen.getByLabelText('Check Method'));

    // ZoneMinder seeds a new zone with Blobs and red (`zone.php:74-75`).
    expect(screen.getByLabelText('Check Method')).toHaveValue('Blobs');
    expect(screen.getByLabelText('Alarm Colour')).toHaveValue('#ff0000');
    await user.type(screen.getByLabelText('Min/Max Pixel Threshold (min)'), '30');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0].method).toBe('POST');
    expect(sent[0].body).toMatchObject({
      type: 'Active', units: 'Pixels', num_coords: 4,
      check_method: 'Blobs', alarm_rgb: 16711680, min_pixel_threshold: 30,
      // Untouched boxes clear their columns, which is a new row's default anyway.
      max_pixel_threshold: null, min_blobs: null,
    });
  });
});
