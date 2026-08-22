import { useState } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useMonitorFilter } from '@/features/monitors/useMonitorFilter';
import type { Monitor, StreamProtocol } from '@/types';
import { useConsoleData, type ConsoleData } from './useConsoleData';

export interface ConsolePageState {
  isAuthenticated: boolean;
  /** Everything `useConsoleData` loads: monitors, live sessions, events, system stats. */
  data: ConsoleData;
  /**
   * The monitor list with the shared filter chips applied. Derived from the
   * filter store rather than from the bar's callback, so the wall is right on
   * first paint and stays right while the bar is closed.
   */
  filteredMonitors: Monitor[];
  /** How many chip selections are narrowing the wall; 0 means unfiltered. */
  activeFilterCount: number;
  /** `data` with `monitors` swapped for the filtered list. */
  filteredData: ConsoleData;
  /** Filtered monitors that are capturing. */
  activeMonitors: Monitor[];
  /** Filtered monitors recording OnMotion or Always. */
  recordingMonitors: Monitor[];
  /** Protocol for live thumbnails; null = static thumbnails. */
  liveProtocol: StreamProtocol | null;
  setLiveProtocol: (protocol: StreamProtocol | null) => void;
}

/**
 * Page state for the Console. Composes `useConsoleData` with the filter-bar
 * result and the thumbnail protocol toggle; both skins render from this.
 */
export function useConsolePage(): ConsolePageState {
  const { isAuthenticated } = useAuthStore();
  const data = useConsoleData();

  const [liveProtocol, setLiveProtocol] = useState<StreamProtocol | null>('webrtc');
  const { filtered: filteredMonitors, activeCount: activeFilterCount } =
    useMonitorFilter(data.monitors);

  const activeMonitors = filteredMonitors.filter((m) => m.capturing !== 'None');
  const recordingMonitors = filteredMonitors.filter((m) =>
    ['OnMotion', 'Always'].includes(m.recording),
  );

  return {
    isAuthenticated,
    data,
    filteredMonitors,
    activeFilterCount,
    filteredData: { ...data, monitors: filteredMonitors },
    activeMonitors,
    recordingMonitors,
    liveProtocol,
    setLiveProtocol,
  };
}

export function formatGB(bytes: number): string {
  if (!bytes) return '0 GB';
  const gb = bytes / (1024 ** 3);
  return gb >= 100 ? `${gb.toFixed(0)} GB` : `${gb.toFixed(1)} GB`;
}
