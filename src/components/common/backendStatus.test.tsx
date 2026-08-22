import { QueryClient } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiClientError } from '@/api/client';
import { renderWithProviders } from '@/test/render';
import { attachBackendStatus, useBackendStatus } from './backendStatus';
import { BackendBanner } from './BackendBanner';

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

afterEach(() => useBackendStatus.getState().markReachable());

describe('attachBackendStatus', () => {
  it('flips to unreachable on a network/5xx query error and clears on the next success', async () => {
    const qc = makeClient();
    const detach = attachBackendStatus(qc);
    await qc.fetchQuery({ queryKey: ['a'], queryFn: () => Promise.reject(new ApiClientError('down', 503)) }).catch(() => undefined);
    expect(useBackendStatus.getState().unreachable).toBe(true);
    await qc.fetchQuery({ queryKey: ['b'], queryFn: () => Promise.resolve(1) });
    expect(useBackendStatus.getState().unreachable).toBe(false);
    detach();
  });

  it('ignores 4xx errors', async () => {
    const qc = makeClient();
    const detach = attachBackendStatus(qc);
    await qc.fetchQuery({ queryKey: ['c'], queryFn: () => Promise.reject(new ApiClientError('no', 403)) }).catch(() => undefined);
    expect(useBackendStatus.getState().unreachable).toBe(false);
    detach();
  });

  it('listens to mutations too', async () => {
    const qc = makeClient();
    const detach = attachBackendStatus(qc);
    const m = qc.getMutationCache().build(qc, { mutationFn: () => Promise.reject(new ApiClientError('x', 0)) });
    await m.execute(undefined).catch(() => undefined);
    expect(useBackendStatus.getState().unreachable).toBe(true);
    detach();
  });

  it('stops listening after detach', async () => {
    const qc = makeClient();
    attachBackendStatus(qc)();
    await qc.fetchQuery({ queryKey: ['d'], queryFn: () => Promise.reject(new ApiClientError('down', 500)) }).catch(() => undefined);
    expect(useBackendStatus.getState().unreachable).toBe(false);
  });
});

describe('BackendBanner', () => {
  it('renders nothing while reachable and an alert while not', async () => {
    const { rerender } = renderWithProviders(<BackendBanner />);
    expect(screen.queryByRole('alert')).toBeNull();
    useBackendStatus.getState().markUnreachable();
    rerender(<BackendBanner />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach the server'));
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('needs a QueryClientProvider (documented contract)', () => {
    useBackendStatus.getState().markUnreachable();
    expect(() => render(<BackendBanner />)).toThrow();
  });
});
