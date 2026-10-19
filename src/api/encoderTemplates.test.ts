import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse, type JsonBodyType } from 'msw';
import { setupServer } from 'msw/node';
import { useAuthStore } from '@/stores/auth';
import { listEncoderTemplates, getEncoderTemplate, createEncoderTemplate, updateEncoderTemplate, deleteEncoderTemplate } from './encoderTemplates';
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


describe('encoder templates (zm-api#144)', () => {
  it('lists the unpaginated array', async () => {
    record([{ id: 7, encoder: 'h264_nvenc', name: 'Balanced', params: 'preset=p4' }]);
    const out = await listEncoderTemplates();
    expect(out[0].encoder).toBe('h264_nvenc');
    expect(seen[0]).toMatchObject({ method: 'GET', url: '/api/v3/encoder-templates' });
  });
  it('reads, creates, updates (PUT) and deletes', async () => {
    record({ id: 7 });
    await getEncoderTemplate(7);
    expect(seen[0].url).toBe('/api/v3/encoder-templates/7');
    record({ id: 8 });
    await createEncoderTemplate({ encoder: 'libx264', name: 'Fast', params: 'preset=fast' });
    expect(seen[0]).toMatchObject({ method: 'POST', url: '/api/v3/encoder-templates', body: { encoder: 'libx264', name: 'Fast', params: 'preset=fast' } });
    record({ id: 8 });
    await updateEncoderTemplate(8, { description: null });
    expect(seen[0]).toMatchObject({ method: 'PUT', url: '/api/v3/encoder-templates/8', body: { description: null } });
    record(null, 204);
    await deleteEncoderTemplate(8);
    expect(seen[0]).toMatchObject({ method: 'DELETE', url: '/api/v3/encoder-templates/8' });
  });
});
