import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { Monitor } from '@/types';
import { useMontageStore } from '@/stores/montage';
import { autoColumns, MONTAGE_PRESETS } from './classicPresets';

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children, to,
    ...rest
  }: { children: React.ReactNode; to?: string; [k: string]: unknown }) => (
    <a href={to ?? '#'} {...rest}>{children}</a>
  ),
}));

// StreamCell pulls in the streaming hooks; replace with a sentinel that
// records its props so the test stays scoped to the grid + toolbar.
const streamCellProps: Array<Record<string, unknown>> = [];
vi.mock('@/components/common/StreamCell', () => ({
  StreamCell: (props: { monitorId: number }) => {
    streamCellProps.push(props);
    return <div data-testid={`stream-${props.monitorId}`} />;
  },
}));

// Runtime status comes from a polled query; stub the hook with fixed rows.
vi.mock('@/features/monitors/useMonitorStatuses', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/monitors/useMonitorStatuses')>()),
  useMonitorStatuses: () => ({
    byId: {
      1: { monitorId: 1, status: 'Connected', captureFps: 10.89, analysisFps: 0, bandwidth: 1000, updatedOn: '' },
    },
    list: [],
    isLoading: false,
    isError: false,
  }),
}));

const { MontageClassicGrid } = await import('./MontageClassicGrid');

function makeMonitor(over: Partial<Monitor> = {}): Monitor {
  return {
    id: 1,
    name: 'Front Door',
    width: 1920,
    height: 1080,
    orientation: 'Rotate0',
    capturing: 'Always',
    analysing: 'Always',
    recording: 'OnMotion',
    host: '192.168.1.10',
    type: 'Ffmpeg',
    ...over,
  } as unknown as Monitor;
}

describe('autoColumns — legacy montage.php heuristic', () => {
  it('returns the monitor count for <=3 monitors', () => {
    expect(autoColumns(1)).toBe(1);
    expect(autoColumns(2)).toBe(2);
    expect(autoColumns(3)).toBe(3);
  });

  it('returns 2 for 4 monitors', () => {
    expect(autoColumns(4)).toBe(2);
  });

  it('returns 3 for 5 or 6 monitors', () => {
    expect(autoColumns(5)).toBe(3);
    expect(autoColumns(6)).toBe(3);
  });

  it('returns 4 for counts divisible by 4 (and not <=6)', () => {
    expect(autoColumns(8)).toBe(4);
    expect(autoColumns(16)).toBe(4);
  });

  it('returns 6 for counts divisible by 6 but not 4 (and not <=6)', () => {
    // 18 / 4 = 4.5 (not), 18 / 6 = 3 — divisible.
    expect(autoColumns(18)).toBe(6);
  });

  it('falls back to 4 for everything else', () => {
    expect(autoColumns(7)).toBe(4);
    expect(autoColumns(11)).toBe(4);
  });
});

describe('MontageClassicGrid — preset list', () => {
  it('exposes Auto + every "N Wide" preset the legacy spec requires', () => {
    const labels = MONTAGE_PRESETS.map((p) => p.label);
    expect(labels).toEqual([
      'Auto', '1 Wide', '2 Wide', '3 Wide', '4 Wide', '5 Wide', '6 Wide',
      '8 Wide', '12 Wide', '16 Wide', '20 Wide', '24 Wide', '32 Wide', '48 Wide',
    ]);
  });
});

describe('MontageClassicGrid — live cells', () => {
  it('renders a gated, auto-starting StreamCell per monitor on the stored protocol', () => {
    streamCellProps.length = 0;
    render(<MontageClassicGrid monitors={[makeMonitor({ id: 1 }), makeMonitor({ id: 2 })]} />);
    expect(screen.getByTestId('stream-1')).toBeInTheDocument();
    expect(screen.getByTestId('stream-2')).toBeInTheDocument();
    expect(streamCellProps[0]).toMatchObject({ protocol: 'webrtc', autoStart: true, gated: true, compact: true });
  });

  it('captions each cell with runtime state + capture fps when known, id otherwise', () => {
    render(<MontageClassicGrid monitors={[makeMonitor({ id: 1 }), makeMonitor({ id: 2 })]} />);
    expect(screen.getByTestId('montage-classic-status-1')).toHaveTextContent('Connected · 10.9 fps');
    expect(screen.getByTestId('montage-classic-status-2')).toHaveTextContent('#2');
  });

  it('switching the protocol select updates the shared montage store', async () => {
    const user = userEvent.setup();
    render(<MontageClassicGrid monitors={[makeMonitor({ id: 1 })]} />);
    await user.selectOptions(screen.getByRole('combobox', { name: /stream protocol/i }), 'hls');
    expect(useMontageStore.getState().protocol).toBe('hls');
    useMontageStore.setState({ protocol: 'webrtc' });
  });
});

describe('MontageClassicGrid — rendering', () => {
  it('renders one cell per monitor with the monitor name visible', () => {
    render(
      <MontageClassicGrid
        monitors={[
          makeMonitor({ id: 1, name: 'Front Door' }),
          makeMonitor({ id: 2, name: 'Garage' }),
          makeMonitor({ id: 3, name: 'Driveway' }),
        ]}
      />,
    );
    expect(screen.getByText('Front Door')).toBeInTheDocument();
    expect(screen.getByText('Garage')).toBeInTheDocument();
    expect(screen.getByText('Driveway')).toBeInTheDocument();
    expect(screen.getByTestId('montage-classic-cell-1')).toBeInTheDocument();
    expect(screen.getByTestId('montage-classic-cell-2')).toBeInTheDocument();
    expect(screen.getByTestId('montage-classic-cell-3')).toBeInTheDocument();
  });

  it('renders the empty placeholder when no monitors are passed', () => {
    render(<MontageClassicGrid monitors={[]} />);
    expect(screen.getByTestId('montage-classic-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('montage-classic-grid')).toBeNull();
  });

  it('starts on the Auto preset which uses the heuristic column count', () => {
    render(
      <MontageClassicGrid
        monitors={[
          makeMonitor({ id: 1 }),
          makeMonitor({ id: 2 }),
          makeMonitor({ id: 3 }),
          makeMonitor({ id: 4 }),
        ]}
      />,
    );
    // autoColumns(4) === 2
    const grid = screen.getByTestId('montage-classic-grid');
    expect(grid.getAttribute('data-columns')).toBe('2');
  });
});

describe('MontageClassicGrid — preset selector', () => {
  it('selecting "4 Wide" changes the grid column count to 4', async () => {
    const user = userEvent.setup();
    render(
      <MontageClassicGrid
        monitors={[
          makeMonitor({ id: 1 }),
          makeMonitor({ id: 2 }),
          makeMonitor({ id: 3 }),
        ]}
      />,
    );
    // Auto on 3 monitors → 3 columns.
    expect(screen.getByTestId('montage-classic-grid').getAttribute('data-columns')).toBe('3');
    await user.selectOptions(
      screen.getByRole('combobox', { name: /montage layout preset/i }),
      '4w',
    );
    expect(screen.getByTestId('montage-classic-grid').getAttribute('data-columns')).toBe('4');
  });

  it('selecting "1 Wide" yields a single-column grid', async () => {
    const user = userEvent.setup();
    render(
      <MontageClassicGrid
        monitors={[
          makeMonitor({ id: 1 }),
          makeMonitor({ id: 2 }),
        ]}
      />,
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: /montage layout preset/i }),
      '1w',
    );
    expect(screen.getByTestId('montage-classic-grid').getAttribute('data-columns')).toBe('1');
  });
});
