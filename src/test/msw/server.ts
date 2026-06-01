import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/**
 * Shared MSW server for component tests. Import this and call
 * setupMockServer() from any test file that needs API interception;
 * it wires the lifecycle hooks (beforeAll/afterEach/afterAll) and
 * resets handlers between tests so server.use() overrides don't leak.
 */
export const server = setupServer(...handlers);

export function setupMockServer() {
  beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
}
