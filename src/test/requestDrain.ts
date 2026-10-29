/**
 * Lets every request a test started finish before the next test begins.
 *
 * A test that changes state and returns without awaiting the request that
 * change triggers has handed that request to the next test. MSW matches a
 * request against the handlers in place when it is intercepted, not when
 * `fetch` was called, so the next test's `server.use` could catch it and
 * count it as its own. Three such races lost in a row when Vite 8 and jsdom
 * 30 changed the timing, and a sweep found 874 more requests settling after
 * their test had returned, across 64 files. Rather than touch each site,
 * this drains them: `afterEach` waits (briefly) for the requests still in
 * flight, after giving scheduled effects one tick to issue theirs.
 *
 * It wraps `globalThis.fetch` on top of MSW's interceptor, which `listen()`
 * installs in each file's `beforeAll`, hence the re-wrap in `beforeEach`.
 * The wait is capped, so a handler that never answers (`delay('infinite')`
 * behind a loading-state test) costs a quarter second, not a hang. Real
 * timers are captured at import so a test that left fake timers installed
 * cannot stall the drain.
 *
 * `ZM_DETECT_INFLIGHT=1` additionally names each request that was still
 * pending when its test returned, so the leaks can be fixed at the source.
 */
import { afterEach, beforeEach } from 'vitest';

type Wrapped = typeof fetch & { __zmDrain?: true };

const realSetTimeout = globalThis.setTimeout;
const CAP_MS = 250;
const REPORT = !!process.env.ZM_DETECT_INFLIGHT;

let current = '(no test)';
const pending = new Map<Promise<Response>, string>();

function describe(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return `${input.method} ${input.url}`;
}

function wrap() {
  const inner = globalThis.fetch as Wrapped;
  if (inner.__zmDrain) return;
  const wrapped: Wrapped = function zmDrainingFetch(input, init) {
    const p = inner.call(globalThis, input, init);
    pending.set(p, `${describe(input)} :: ${current}`);
    const settle = () => pending.delete(p);
    p.then(settle, settle);
    return p;
  };
  wrapped.__zmDrain = true;
  globalThis.fetch = wrapped;
}

const tick = () => new Promise<void>((r) => realSetTimeout(r, 0));

async function drain() {
  await tick();
  while (pending.size > 0) {
    await Promise.allSettled([...pending.keys()]);
    await tick();
  }
}

beforeEach((ctx) => {
  wrap();
  current = `${ctx.task.file?.name ?? '?'} > ${ctx.task.name}`;
});

afterEach(async () => {
  // process.stderr, not console: many files silence console.error for the run.
  if (REPORT) for (const d of pending.values()) process.stderr.write(`ZM-INFLIGHT pending at test end :: ${d}\n`);
  await Promise.race([drain(), new Promise<void>((r) => realSetTimeout(r, CAP_MS))]);
});
