import { useEffect } from 'react';
import { useUiStore } from '@/stores/ui';
import { skinIds } from './registry';

/**
 * Keep exactly one `skin-*` class and the matching `data-theme` on <html>.
 *
 * Both are what the token layer in `src/index.css` switches on: the class
 * picks the skin's palette, `data-theme` pins light or dark for skins that
 * have both. `system` removes the attribute so `prefers-color-scheme`
 * decides. The inline bootstrap in `index.html` sets the same two things
 * before first paint; this hook keeps them in sync afterwards.
 */
export function useSkinRootClass(rootClass: string) {
  const theme = useUiStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    for (const id of skinIds) root.classList.remove(`skin-${id}`);
    root.classList.add(rootClass);
    root.dataset.skin = rootClass.replace(/^skin-/, '');
  }, [rootClass]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);
}
