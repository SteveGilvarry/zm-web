import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// React Testing Library unmounts and cleans up between tests so DOM
// state and event listeners don't bleed across.
afterEach(() => {
  cleanup();
});
