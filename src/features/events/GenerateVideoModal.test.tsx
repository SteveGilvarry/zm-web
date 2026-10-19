import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { EventVideo } from '@/api/eventVideos';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth';
import type { ZmEvent } from '@/types';
import { GenerateVideoModal } from './GenerateVideoModal';

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'tok', refreshToken: 'tok',
    // No `perms` claim: every feature reads as Edit (pre-RBAC token).
    user: { user: 'admin', iat: 0, exp: 0 } as never, isAuthenticated: true,
  });
  server.listen({ onUnhandledRequest: 'warn' });
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

const event = { id: 7, monitor_id: 1, width: 2688, height: 1520, name: 'Event 7' } as ZmEvent;
const recorded: EventVideo = { name: '7-video.h264.mp4', format: 'mp4', size_bytes: 2048, recorded: true };
const made: EventVideo = { name: '7-r0_5-S640x362.mp4', format: 'mp4', size_bytes: 4096, recorded: false, rate: 0.5, size: '640x362' };

/** `MediaJobResponse`, what a 202 carries. */
const job = { id: 1, kind: 'video', event_id: 7, monitor_id: 1, status: 'queued', params: {}, created_at: '2026-10-20T00:00:00Z' };

function stubConfigs(rows: Record<string, string> = { ZM_OPT_FFMPEG: '1', ZM_FFMPEG_FORMATS: 'mp4* avi 3gp**' }) {
  server.use(http.get('/api/v3/configs', () => HttpResponse.json({
    items: Object.entries(rows).map(([name, value]) => ({ name, value })),
    total: 1, per_page: 1000, current_page: 1, last_page: 1,
  })));
}

function stubFiles(sequence: EventVideo[][]) {
  let call = 0;
  server.use(http.get('/api/v3/events/7/videos', () =>
    HttpResponse.json(sequence[Math.min(call++, sequence.length - 1)])));
}

const open = (variant: 'classic' | 'modern' = 'classic') => renderWithProviders(
  <GenerateVideoModal isOpen onClose={() => {}} event={event} variant={variant} pollIntervalMs={1} pollTries={5} />,
);

describe('GenerateVideoModal', () => {
  it('lists the files with legacy\'s columns; the recording has no Delete', async () => {
    stubConfigs();
    stubFiles([[recorded, made]]);
    open();
    const table = await screen.findByTestId('video-files');
    await within(table).findByText('7-video.h264.mp4');
    const rows = within(table).getAllByRole('row');
    expect(within(rows[0]).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(
      ['Filename', 'Size', 'Rate', 'Scale', 'Action'],
    );
    expect(rows[1]).toHaveTextContent('2.00kB');
    expect(within(rows[1]).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(rows[2]).toHaveTextContent('1/2x');
    expect(rows[2]).toHaveTextContent('640x362');
    expect(within(rows[2]).getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href', '/api/v3/events/7/videos/7-r0_5-S640x362.mp4?token=tok',
    );
  });

  it('says so when there are no files', async () => {
    stubConfigs();
    stubFiles([[]]);
    open();
    expect(await screen.findByText('No Video Files Found')).toBeInTheDocument();
  });

  it('queues the job with the picked options, then polls until the file appears', async () => {
    const user = userEvent.setup();
    stubConfigs();
    stubFiles([[recorded], [recorded], [recorded, made], [recorded, made]]);
    let body: unknown = null;
    server.use(http.post('/api/v3/events/7/videos', async ({ request }) => {
      body = await request.json();
      return HttpResponse.json(job, { status: 202 });
    }));
    open();
    await screen.findByText('7-video.h264.mp4');
    // The starred format is the default.
    await waitFor(() => expect(screen.getByLabelText('Video Format')).toHaveValue('mp4'));
    await user.selectOptions(screen.getByLabelText('Frame Rate'), '1/2x');
    await user.selectOptions(screen.getByLabelText('Video Size'), 'Max 640px');
    await user.selectOptions(screen.getByLabelText('Transform'), 'Grayscale');
    await user.click(screen.getByLabelText('Overwrite Existing'));
    await user.click(screen.getByRole('button', { name: 'Generate Video' }));

    expect(await screen.findByText('Export Succeeded (7-r0_5-S640x362.mp4)')).toBeInTheDocument();
    expect(body).toEqual({ format: 'mp4', rate: 0.5, size: '640x362', transform: 'greyscale', overwrite: true });
    expect(screen.getByRole('button', { name: '7-r0_5-S640x362.mp4' })).toBeInTheDocument();
  });

  it('stops polling with a message when nothing turns up', async () => {
    const user = userEvent.setup();
    stubConfigs();
    stubFiles([[recorded]]);
    server.use(http.post('/api/v3/events/7/videos', () => HttpResponse.json(job, { status: 202 })));
    open('modern');
    await screen.findByText('7-video.h264.mp4');
    await user.click(screen.getByRole('button', { name: 'Generate Video' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No new video file has appeared yet');
  });

  it('reports a refused job (the box answers 500 while its jobs table is missing)', async () => {
    const user = userEvent.setup();
    stubConfigs();
    stubFiles([[recorded]]);
    server.use(http.post('/api/v3/events/7/videos', () =>
      HttpResponse.json({ kind: 'DATABASE_ERROR', error_message: 'A database error occurred' }, { status: 500 })));
    open();
    await screen.findByText('7-video.h264.mp4');
    await user.click(screen.getByRole('button', { name: 'Generate Video' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Export Failed');
  });

  it('deletes a generated file and plays one when its name is clicked', async () => {
    const user = userEvent.setup();
    stubConfigs();
    stubFiles([[recorded, made], [recorded]]);
    let deleted = '';
    server.use(http.delete('/api/v3/events/7/videos/:name', ({ params }) => {
      deleted = String(params.name);
      return new HttpResponse(null, { status: 204 });
    }));
    const { container } = open();
    await user.click(await screen.findByRole('button', { name: '7-r0_5-S640x362.mp4' }));
    expect(container.ownerDocument.querySelector('video')).toHaveAttribute(
      'src', '/api/v3/events/7/videos/7-r0_5-S640x362.mp4?token=tok',
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleted).toBe('7-r0_5-S640x362.mp4'));
    await waitFor(() => expect(screen.queryByRole('button', { name: '7-r0_5-S640x362.mp4' })).toBeNull());
    expect(container.ownerDocument.querySelector('video')).toBeNull();
  });

  it('disables Generate when ffmpeg is off (legacy opt_ffmpeg)', async () => {
    stubConfigs({ ZM_OPT_FFMPEG: '0', ZM_FFMPEG_FORMATS: 'mp4*' });
    stubFiles([[recorded]]);
    open();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate Video' })).toBeDisabled());
  });
});
