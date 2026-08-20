import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAuthStore } from '@/stores/auth';
import { formatGB, useConsolePage } from './useConsolePage';

// useConsoleData fires eight queries; the page hook only composes it, so
// stub it and test the composition.
const { fakeData } = vi.hoisted(() => {
  const monitors = [
    { id: 1, name: 'Front', capturing: 'Always', recording: 'Always' },
    { id: 2, name: 'Back', capturing: 'None', recording: 'None' },
    { id: 3, name: 'Side', capturing: 'Ondemand', recording: 'OnMotion' },
  ];
  return {
    fakeData: {
      monitors,
      liveSessions: [1],
      events: [],
      eventCount24h: 4,
      daemons: [],
      isSystemRunning: true,
      systemStats: undefined,
      summariesByMonitor: [],
      hourlyByMonitor: {},
      loading: { monitors: false, events: false },
    },
  };
});

vi.mock('./useConsoleData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./useConsoleData')>()),
  useConsoleData: () => fakeData,
}));

beforeAll(() => {
  useAuthStore.setState({
    accessToken: 'test', refreshToken: 'test', user: null, isAuthenticated: true,
  });
});
afterAll(() => useAuthStore.getState().clearAuth());

describe('useConsolePage', () => {
  it('starts with the full monitor list and derives active / recording counts', () => {
    const { result } = renderHook(() => useConsolePage());
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.filteredMonitors).toHaveLength(3);
    expect(result.current.activeMonitors.map((m) => m.id)).toEqual([1, 3]);
    expect(result.current.recordingMonitors.map((m) => m.id)).toEqual([1, 3]);
    expect(result.current.liveProtocol).toBe('webrtc');
  });

  it('re-derives from the filter-bar result and swaps it into filteredData', () => {
    const { result } = renderHook(() => useConsolePage());
    act(() => result.current.setFilteredMonitors([fakeData.monitors[1]] as never));
    expect(result.current.filteredMonitors.map((m) => m.id)).toEqual([2]);
    expect(result.current.activeMonitors).toEqual([]);
    expect(result.current.filteredData.monitors.map((m) => m.id)).toEqual([2]);
    // The rest of the data is passed through untouched.
    expect(result.current.filteredData.eventCount24h).toBe(4);
    expect(result.current.data.monitors).toHaveLength(3);
  });

  it('switches the thumbnail protocol, including off', () => {
    const { result } = renderHook(() => useConsolePage());
    act(() => result.current.setLiveProtocol('hls'));
    expect(result.current.liveProtocol).toBe('hls');
    act(() => result.current.setLiveProtocol(null));
    expect(result.current.liveProtocol).toBeNull();
  });
});

describe('formatGB', () => {
  it('formats bytes as GB with one decimal under 100 GB', () => {
    expect(formatGB(0)).toBe('0 GB');
    expect(formatGB(1.5 * 1024 ** 3)).toBe('1.5 GB');
    expect(formatGB(250 * 1024 ** 3)).toBe('250 GB');
  });
});
