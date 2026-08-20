import { discoverPages } from '../discoverPages';
import type { SkinDefinition } from '../types';
import { ModernShell } from './Shell';

/**
 * Mission Control — the modern skin. Dark, panel-based, live thumbnails.
 * It is also the fallback skin: pages other skins have not implemented yet
 * render from here.
 */
export const modernSkin: SkinDefinition = {
  id: 'modern',
  name: 'Mission Control',
  description:
    'The modern dashboard — adaptive layouts, live thumbnails, dense data panels.',
  rootClass: 'skin-modern',
  colorSchemes: ['dark'],
  Shell: ModernShell,
  pages: discoverPages(import.meta.glob(['./pages/*.tsx', '!./pages/*.test.tsx'])),
};
