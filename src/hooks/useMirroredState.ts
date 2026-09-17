import { useState } from 'react';

/**
 * A local draft that follows an external value.
 *
 * Text boxes that debounce into the URL, and numeric jump-to-page inputs,
 * need their own state while the operator types but must snap back whenever
 * the URL changes underneath them. This is React's documented "adjust state
 * during render" pattern rather than an effect: the reset happens in the same
 * render that first sees the new value, so the input never paints a stale
 * frame and no cascading render is queued.
 *
 * https://react.dev/reference/react/useState#storing-information-from-previous-renders
 */
export function useMirroredState<T>(external: T): [T, (value: T) => void] {
  const [draft, setDraft] = useState(external);
  const [mirrored, setMirrored] = useState(external);
  if (!Object.is(mirrored, external)) {
    setMirrored(external);
    setDraft(external);
  }
  return [draft, setDraft];
}
