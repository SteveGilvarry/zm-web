import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

import { routeTree } from './routeTree.gen';
import { retryDelayForError, shouldRetryQuery } from '@/api/client';
import { attachBackendStatus } from '@/components/common/backendStatus';
import { migrateLegacyPreferences } from '@/lib/legacyPreferences';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import {
  AppCrashFallback,
  NotFoundFallback,
  RouteErrorFallback,
} from '@/components/common/RouteFallbacks';
import './i18n';
import './index.css';

// Before anything reads a preference: the project's storage keys were
// renamed with the project (zm-dashboard → zm-web).
migrateLegacyPreferences();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      // Transient failures (network, 5xx, 429) get two more tries; another
      // 4xx is final. A 429 waits as long as the server's Retry-After says.
      retry: (failureCount, error) => shouldRetryQuery(failureCount, error),
      retryDelay: (failureCount, error) => retryDelayForError(failureCount, error),
    },
    mutations: {
      retry: false,
    },
  },
});

// Feeds the "backend unreachable" banner in both shells.
attachBackendStatus(queryClient);

const router = createRouter({
  routeTree,
  // Mirrors Vite's `base` (VITE_BASE) so routes resolve under a sub-path.
  basepath: import.meta.env.BASE_URL,
  context: {},
  defaultPreload: 'intent',
  defaultErrorComponent: RouteErrorFallback,
  defaultNotFoundComponent: NotFoundFallback,
});

// Register the router for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallback={(error, reset) => <AppCrashFallback error={error} reset={reset} />}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        {import.meta.env.DEV && <ReactQueryDevtools position="bottom" />}
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);
