// Pulls the @testing-library/jest-dom matcher augmentations into the
// type program so `tsc` knows about `toBeInTheDocument()` & friends on
// Vitest's `expect`. The runtime side of this is wired up in
// `vitest.setup.ts`; this declaration only exists for the typechecker
// (kept out of `vitest.setup.ts` itself so that file isn't pulled into
// the strict app tsconfig, which forbids TS-only syntax via
// `erasableSyntaxOnly`).
import '@testing-library/jest-dom/vitest';
