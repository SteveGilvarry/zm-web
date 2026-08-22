/**
 * Geometry for `FitBox`, in its own module so the component file exports
 * only a component (fast refresh) and so the maths can be tested directly.
 */

/**
 * Largest `aspect`-shaped box inside `width × height`, never wider than
 * `maxWidth`. Returns null before the first measurement, so the caller can
 * fall back to a CSS aspect box rather than render a zero-sized hole.
 */
export function fitToBox(
  width: number,
  height: number,
  aspect: number,
  maxWidth?: number,
): { width: number; height: number } | null {
  if (!(width > 0) || !(height > 0) || !(aspect > 0)) return null;
  const cap = maxWidth && maxWidth > 0 ? Math.min(width, maxWidth) : width;
  const w = Math.min(cap, height * aspect);
  return { width: w, height: w / aspect };
}
