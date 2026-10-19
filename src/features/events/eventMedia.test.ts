import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { EventVideo } from '@/api/eventVideos';
import { useAuthStore } from '@/stores/auth';
import {
  capExportIds, mediaSize, parseFfmpegFormats, saveBlob, videoRateText, videoScaleText, videoSizeRequest,
  waitForGeneratedVideo,
} from './eventMedia';

const server = setupServer();
beforeAll(() => {
  useAuthStore.setState({ accessToken: 'test', refreshToken: 'test', isAuthenticated: true });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); useAuthStore.getState().clearAuth(); });

const file = (over: Partial<EventVideo>): EventVideo => ({
  name: 'x.mp4', format: 'mp4', size_bytes: 10, recorded: false, ...over,
});

describe('capExportIds', () => {
  it('keeps the first 500 and says how many there were', () => {
    const ids = Array.from({ length: 501 }, (_, i) => i + 1);
    const cap = capExportIds(ids);
    expect(cap.ids).toHaveLength(500);
    expect(cap.ids.at(-1)).toBe(500);
    expect(cap).toMatchObject({ total: 501, capped: true });
    expect(capExportIds([3, 4])).toEqual({ ids: [3, 4], total: 2, capped: false });
  });
});

describe('parseFfmpegFormats', () => {
  it('takes the single-starred format as the default, as video.php does', () => {
    // The live box's value on 2026-10-20.
    expect(parseFfmpegFormats('mp4* mpg mpeg wmv asf avi mov swf 3gp**')).toEqual({
      formats: ['mp4', 'mpg', 'mpeg', 'wmv', 'asf', 'avi', 'mov', 'swf', '3gp'],
      defaultFormat: 'mp4',
    });
    // ZoneMinder's stock value: avi is the default; 3gp** is the streaming one.
    expect(parseFfmpegFormats('mpg mpeg wmv asf avi* mov swf 3gp**').defaultFormat).toBe('avi');
    expect(parseFfmpegFormats('webm mkv').defaultFormat).toBe('webm');
    expect(parseFfmpegFormats('')).toEqual({ formats: [], defaultFormat: '' });
  });
});

describe('videoSizeRequest', () => {
  it('fits the width to the cap, keeping the aspect with an even height', () => {
    expect(videoSizeRequest('max640', 2688, 1520)).toEqual({ size: '640x362' });
    expect(videoSizeRequest('max1280', 2160, 3840)).toEqual({ size: '1280x2276' });
  });
  it('stays at scale 1 for Actual, a narrower event or unknown dimensions', () => {
    expect(videoSizeRequest('actual', 1920, 1080)).toEqual({ scale: 1 });
    expect(videoSizeRequest('max1600', 1280, 720)).toEqual({ scale: 1 });
    expect(videoSizeRequest('max640', 0, 0)).toEqual({ scale: 1 });
  });
});

describe('file table text', () => {
  it('reads rate and scale the way legacy prints them', () => {
    expect(videoRateText(file({ rate: 0.5 }))).toBe('1/2x');
    expect(videoRateText(file({ rate: 3 }))).toBe('3x');
    expect(videoRateText(file({ fps: 15 }))).toBe('15fps');
    expect(videoRateText(file({}))).toBe('');
    expect(videoScaleText(file({ scale: 1 }), 'Actual')).toBe('Actual');
    expect(videoScaleText(file({ scale: 0.5 }), 'Actual')).toBe('0.5x');
    expect(videoScaleText(file({ size: '640x360' }), 'Actual')).toBe('640x360');
    expect(videoScaleText(file({}), 'Actual')).toBe('');
  });
  it('prints sizes in each skin\'s style', () => {
    expect(mediaSize('classic', 2048)).toBe('2.00kB');
    expect(mediaSize('modern', 2048)).toBe('2.0 KB');
    expect(mediaSize('classic', null)).toBe('0.00B');
  });
});

describe('saveBlob', () => {
  it('clicks an anchor with the download name and releases the URL afterwards', async () => {
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:1'), configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revoke, configurable: true });
    const seen: Array<{ download: string; href: string }> = [];
    const spy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      seen.push({ download: this.download, href: this.href });
    });
    saveBlob(new Blob(['PK']), 'zm.zip');
    expect(seen).toEqual([{ download: 'zm.zip', href: 'blob:1' }]);
    expect(document.querySelector('a[download]')).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(revoke).toHaveBeenCalledWith('blob:1');
    spy.mockRestore();
  });
});

describe('waitForGeneratedVideo', () => {
  const recorded = file({ name: '7-video.mp4', recorded: true, size_bytes: 999 });
  const noSleep = () => Promise.resolve();

  it('returns a new file once its size holds still between two polls', async () => {
    const answers = [
      [recorded],
      [recorded, file({ name: '7-r1-s1.mp4', size_bytes: 100 })],
      [recorded, file({ name: '7-r1-s1.mp4', size_bytes: 400 })],
      [recorded, file({ name: '7-r1-s1.mp4', size_bytes: 400 })],
    ];
    let calls = 0;
    server.use(http.get('/api/v3/events/7/videos', () => HttpResponse.json(answers[Math.min(calls++, answers.length - 1)])));
    const made = await waitForGeneratedVideo(7, [recorded], { sleep: noSleep, tries: 10 });
    expect(made?.name).toBe('7-r1-s1.mp4');
    expect(calls).toBe(4);
  });

  it('notices an overwritten file by its new size', async () => {
    const old = file({ name: '7-r1-s1.mp4', size_bytes: 400 });
    const fresh = file({ name: '7-r1-s1.mp4', size_bytes: 512 });
    server.use(http.get('/api/v3/events/7/videos', () => HttpResponse.json([recorded, fresh])));
    const made = await waitForGeneratedVideo(7, [recorded, old], { sleep: noSleep, tries: 5 });
    expect(made).toEqual(fresh);
  });

  it('gives up after the cap, and stops early when cancelled', async () => {
    let calls = 0;
    server.use(http.get('/api/v3/events/7/videos', () => { calls++; return HttpResponse.json([recorded]); }));
    expect(await waitForGeneratedVideo(7, [recorded], { sleep: noSleep, tries: 3 })).toBeNull();
    expect(calls).toBe(3);
    calls = 0;
    expect(await waitForGeneratedVideo(7, [recorded], { sleep: noSleep, tries: 3, isCancelled: () => true })).toBeNull();
    expect(calls).toBe(0);
  });
});
