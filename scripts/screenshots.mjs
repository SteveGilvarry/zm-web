/**
 * Regenerate the README screenshots.
 *
 *   VITE_API_PROXY_TARGET=http://192.168.0.45:8080 npm run dev   # in one shell
 *   TEST_USERNAME=… TEST_PASSWORD=… node scripts/screenshots.mjs
 *
 * Camera images are blurred, as they show a real house. That is done in the
 * page rather than afterwards, so a refresh cannot forget it: every <video>
 * and <img> gets a CSS blur before the shutter, which also covers event
 * thumbnails and snapshots. The dev-tools overlays are hidden for the same
 * reason — they are not part of the product.
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.SHOT_BASE_URL ?? 'http://localhost:5173';
const OUT = 'docs/screenshots';
const USER = process.env.TEST_USERNAME;
const PASS = process.env.TEST_PASSWORD;
if (!USER || !PASS) throw new Error('TEST_USERNAME and TEST_PASSWORD are required');

/** Blur the cameras, hide the dev overlays, stop animations mid-flight. */
const DRESS = `
  video, img { filter: blur(14px) !important; }
  .tsqd-parent-container, [data-tsrd-portal], #tsr-dev-tools,
  [aria-label*="devtools" i], [aria-label*="Devtools" i] { display: none !important; }
  *, *::before, *::after { animation-play-state: paused !important; transition: none !important; }
`;

const SHOTS = [
  { file: 'modern.png',          path: '/',                    skin: 'modern',  theme: 'dark'  },
  { file: 'modern-events.png',   path: '/events',              skin: 'modern',  theme: 'dark'  },
  { file: 'modern-watch.png',    path: '/monitors/1',          skin: 'modern',  theme: 'dark'  },
  { file: 'modern-montage.png',  path: '/montage',             skin: 'modern',  theme: 'dark'  },
  { file: 'modern-light.png',    path: '/',                    skin: 'modern',  theme: 'light' },
  { file: 'modern-settings.png', path: '/settings',            skin: 'modern',  theme: 'dark'  },
  // Classic pages are short: crop to the content rather than leave half a
  // frame of empty page, which is how the original shot was taken.
  { file: 'classic.png',         path: '/',       skin: 'classic', theme: 'light', crop: 580 },
  { file: 'classic-events.png',  path: '/events', skin: 'classic', theme: 'light', crop: 760 },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`${BASE}/login`);
await page.getByRole('textbox', { name: 'Username' }).fill(USER);
await page.getByRole('textbox', { name: 'Password' }).fill(PASS);
await page.getByRole('button', { name: 'Sign In' }).click();
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
await page.evaluate(() => localStorage.setItem('zm-web:skinHintDismissed', String(Date.now())));

await mkdir(OUT, { recursive: true });
for (const shot of SHOTS) {
  await page.evaluate(({ skin, theme }) => {
    const raw = JSON.parse(localStorage.getItem('zm-ui') ?? '{}');
    raw.state = { ...(raw.state ?? {}), skin, theme };
    localStorage.setItem('zm-ui', JSON.stringify(raw));
  }, shot);
  await page.goto(`${BASE}${shot.path}`, { waitUntil: 'load' });
  // Live tiles need a moment to paint a frame; a blurred black box is a
  // worse advert than a blurred picture.
  await page.waitForTimeout(shot.path === '/' || shot.path.startsWith('/mont') ? 9_000 : 4_000);
  await page.addStyleTag({ content: DRESS });
  await page.waitForTimeout(400);
  await page.screenshot({
    path: `${OUT}/${shot.file}`,
    ...(shot.crop ? { clip: { x: 0, y: 0, width: 1440, height: shot.crop } } : {}),
  });
  console.log(`  ${shot.file}  ${shot.skin}/${shot.theme}  ${shot.path}`);
}

await browser.close();
