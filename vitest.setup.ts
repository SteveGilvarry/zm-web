import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// React Testing Library unmounts and cleans up between tests so DOM
// state and event listeners don't bleed across.
afterEach(() => {
  cleanup();
});

// jsdom lacks IntersectionObserver + ResizeObserver. Both are used by
// MonitorPreview / StreamCell / the justified-row grid for visibility +
// container-size detection. Stub them so component tests can mount these
// components without crashing.
class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] { return []; }
}
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-expect-error — overwrite to add the polyfill.
globalThis.IntersectionObserver ??= MockIntersectionObserver;
// @ts-expect-error — same.
globalThis.ResizeObserver ??= MockResizeObserver;
