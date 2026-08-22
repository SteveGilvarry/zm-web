import { discoverPages } from '../discoverPages';
import type { SkinDefinition } from '../types';
import { ModernShell } from './Shell';

/**
 * Modern — the content-first ops console (see `docs/DESIGN.md`): the cameras
 * fill the frame, one line carries the chrome, and colour is reserved for
 * state. It is also the fallback skin: pages other skins have not
 * implemented yet render from here.
 */
export const modernSkin: SkinDefinition = {
  id: 'modern',
  name: 'Modern',
  description:
    'Cameras fill the screen and the chrome stays out of the way — a live wall, dense tables, dark or light.',
  rootClass: 'skin-modern',
  // Both schemes are designed, not inverted (docs/DESIGN.md).
  colorSchemes: ['light', 'dark'],
  Shell: ModernShell,
  pages: discoverPages(import.meta.glob(['./pages/*.tsx', '!./pages/*.test.tsx'])),
};
