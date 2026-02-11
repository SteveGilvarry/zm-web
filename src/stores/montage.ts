import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GridLayout, StreamProtocol } from '@/types';

interface MontageState {
  layout: GridLayout;
  protocol: StreamProtocol;
  selectedMonitorIds: number[];
  isStreamingAll: boolean;

  setLayout: (layout: GridLayout) => void;
  setProtocol: (protocol: StreamProtocol) => void;
  setSelectedMonitorIds: (ids: number[]) => void;
  setStreamingAll: (streaming: boolean) => void;
}

export const useMontageStore = create<MontageState>()(
  persist(
    (set) => ({
      layout: '2x2',
      protocol: 'webrtc',
      selectedMonitorIds: [],
      isStreamingAll: false,

      setLayout: (layout) => set({ layout }),
      setProtocol: (protocol) => set({ protocol }),
      setSelectedMonitorIds: (ids) => set({ selectedMonitorIds: ids }),
      setStreamingAll: (streaming) => set({ isStreamingAll: streaming }),
    }),
    {
      name: 'zm-montage',
      partialize: (state) => ({
        layout: state.layout,
        protocol: state.protocol,
        selectedMonitorIds: state.selectedMonitorIds,
        // isStreamingAll is NOT persisted — streams don't auto-resume
      }),
    }
  )
);
