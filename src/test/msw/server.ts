import { setupServer } from 'msw/node';
import { handlers, resetDb } from './handlers';

/**
 * Shared MSW server for component tests. Import this and call
 * setupMockServer() from any test file that needs API interception;
 * it wires the lifecycle hooks (beforeAll/afterEach/afterAll), resets
 * handlers between tests so `server.use()` overrides don't leak, and
 * restores the in-memory store so writes from one test aren't visible
 * to the next.
 */
export const server = setupServer(...handlers);

export function setupMockServer(
  options: { onUnhandledRequest?: 'warn' | 'error' | 'bypass' } = {},
) {
  beforeAll(() => server.listen({ onUnhandledRequest: options.onUnhandledRequest ?? 'warn' }));
  afterEach(() => {
    server.resetHandlers();
    resetDb();
  });
  afterAll(() => server.close());
}

export { db, resetDb } from './handlers';
