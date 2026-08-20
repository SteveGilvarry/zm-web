import { discoverPages } from '../discoverPages';
import type { SkinDefinition } from '../types';
import { ClassicShell } from './Shell';

/**
 * Classic ZoneMinder — the legacy-layout skin. Top nav, stat strip, white
 * dense tables, the page structure operators know from the PHP UI.
 *
 * Pages it has not implemented yet fall back to Mission Control's; the
 * skin-coverage test (`src/skins/registry.test.ts`) lists them.
 */
export const classicSkin: SkinDefinition = {
  id: 'classic',
  name: 'Classic ZoneMinder',
  description:
    'Faithful to the legacy ZoneMinder layout — top nav and dense tables, for operators migrating from the old interface.',
  rootClass: 'skin-classic',
  colorSchemes: ['light'],
  Shell: ClassicShell,
  pages: discoverPages(import.meta.glob(['./pages/*.tsx', '!./pages/*.test.tsx'])),
};
