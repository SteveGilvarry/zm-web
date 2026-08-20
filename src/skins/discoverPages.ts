import { lazy, type ComponentType } from 'react';
import type { PageComponents, PageKey } from './types';

/**
 * Turn a Vite `import.meta.glob('./pages/*.tsx')` result into a typed map of
 * lazy page components keyed by filename: `./pages/events.list.tsx` →
 * `events.list`. Components are created here, once per module load, so
 * rendering never creates a component during render.
 *
 * Each skin calls this in its `index.ts`; adding a page is creating the file.
 * Test files are ignored so they never become pages.
 */
export function discoverPages(
  globbed: Record<string, () => Promise<unknown>>,
): PageComponents {
  const pages: Record<string, unknown> = {};
  for (const [path, loader] of Object.entries(globbed)) {
    const file = path.split('/').pop() ?? '';
    if (/\.(test|spec)\.tsx?$/.test(file)) continue;
    const key = file.replace(/\.tsx?$/, '');
    pages[key] = lazy(loader as () => Promise<{ default: ComponentType<object> }>);
  }
  return pages as PageComponents;
}

export function pageKeysOf(pages: PageComponents): PageKey[] {
  return Object.keys(pages) as PageKey[];
}
