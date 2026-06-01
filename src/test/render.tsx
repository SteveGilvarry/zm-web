import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

/**
 * Test renderer that wires the global providers a component would see
 * if it were mounted in the real app. Each invocation gets a fresh
 * QueryClient so cache state doesn't leak across tests.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,        // surface errors immediately
        gcTime: 0,           // don't keep results between tests
        staleTime: 0,
      },
      mutations: { retry: false },
    },
  });
}

interface WrapperProps {
  children: ReactNode;
}

export function renderWithProviders(
  ui: ReactElement,
  options?: RenderOptions,
): RenderResult & { queryClient: QueryClient } {
  const queryClient = makeQueryClient();
  function Wrapper({ children }: WrapperProps) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return Object.assign(
    render(ui, { wrapper: Wrapper, ...options }),
    { queryClient },
  );
}
