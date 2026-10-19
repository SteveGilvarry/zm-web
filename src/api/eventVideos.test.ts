import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse, type JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import { useAuthStore } from '@/stores/auth';
import { listEventVideos, generateEventVideo, deleteEventVideo, getEventVideoFileUrl, exportEvents, listMediaJobs, getMediaJob, deleteMediaJob } from './eventVideos';
const server = setupServer();
let seen: Array<{ method: string; url: string; body: unknown }> = [];
/** Answer any route with `reply`, recording method, URL and JSON body. */
function record(reply: JsonBodyType = {}, status = 200) {
  seen = [];
  server.use(http.all('*', async ({ request }) => {
    let body: unknown = null;
    try { body = await request.clone().json(); } catch { /* no body */ }
    seen.push({ method: request.method, url: new URL(request.url).pathname + new URL(request.url).search, body });
    return status === 204 ? new HttpResponse(null, { status }) : HttpResponse.json(reply, { status });
  }));
}

beforeAll(() => {
  useAuthStore.setState({ accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });


describe('event videos (zm-api#187)', () => {
  it('lists the recording and any generated files', async () => {
    record([{ name: '33593-video.h264.mp4', format: 'mp4', size_bytes: 1, recorded: true }]);
    const out = await listEventVideos(33593);
    expect(out[0].recorded).toBe(true);
    expect(seen[0]).toMatchObject({ method: 'GET', url: '/api/v3/events/33593/videos' });
  });
  it('queues a generate job with the options legacy\'s modal offers', async () => {
    record({});
    await generateEventVideo(33593, { format: 'mp4', rate: 2, transform: 'greyscale', overwrite: true });
    expect(seen[0]).toMatchObject({ method: 'POST', url: '/api/v3/events/33593/videos', body: { format: 'mp4', rate: 2, transform: 'greyscale', overwrite: true } });
  });
  it('deletes a generated file by name, escaping it in the path', async () => {
    record(null, 204);
    await deleteEventVideo(33593, 'a b.mp4');
    expect(seen[0]).toMatchObject({ method: 'DELETE', url: '/api/v3/events/33593/videos/a%20b.mp4' });
  });
  it('builds a download link with the token in the query', () => {
    expect(getEventVideoFileUrl(5, 'x.mp4')).toBe('/api/v3/events/5/videos/x.mp4');
    expect(getEventVideoFileUrl(5, 'x.mp4', 'a/b')).toBe('/api/v3/events/5/videos/x.mp4?token=a%2Fb');
  });
});

describe('export (zm-api#30)', () => {
  it('posts the ids and parts and hands back the zip with its filename', async () => {
    seen = [];
    server.use(http.post('*/api/v3/events/export', async ({ request }) => {
      seen.push({ method: request.method, url: new URL(request.url).pathname, body: await request.json() });
      return new HttpResponse(new Uint8Array([0x50, 0x4b]).buffer, {
        status: 200,
        headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="zmExport_1.zip"' },
      });
    }));
    const out = await exportEvents({ ids: [1, 2], include: ['details', 'video'] });
    expect(seen[0].body).toEqual({ ids: [1, 2], include: ['details', 'video'] });
    expect(out.filename).toBe('zmExport_1.zip');
    expect(out.blob.size).toBe(2);
  });
  it('surfaces the API error envelope on failure', async () => {
    record({ kind: 'BAD_REQUEST_ERROR', error_message: 'too many ids' }, 400);
    await expect(exportEvents({ ids: [] })).rejects.toThrow('too many ids');
  });
});

describe('media jobs', () => {
  it('lists with filters, reads and cancels', async () => {
    record([]);
    await listMediaJobs({ event_id: 7, status: 'queued' });
    expect(seen[0]).toMatchObject({ method: 'GET', url: '/api/v3/jobs?event_id=7&status=queued' });
    record({ id: 3, status: 'done' });
    expect((await getMediaJob(3)).status).toBe('done');
    expect(seen[0].url).toBe('/api/v3/jobs/3');
    record(null, 204);
    await deleteMediaJob(3);
    expect(seen[0]).toMatchObject({ method: 'DELETE', url: '/api/v3/jobs/3' });
  });
});
