import { useEffect } from 'react';
import { skinIds } from './registry';

/** Keep exactly one `skin-*` class on <html>, matching the active skin. */
export function useSkinRootClass(rootClass: string) {
  useEffect(() => {
    const root = document.documentElement;
    for (const id of skinIds) root.classList.remove(`skin-${id}`);
    root.classList.add(rootClass);
    root.dataset.skin = rootClass.replace(/^skin-/, '');
  }, [rootClass]);
}
