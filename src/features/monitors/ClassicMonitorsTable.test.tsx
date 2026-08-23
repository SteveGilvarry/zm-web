import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Monitor } from '@/types';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to?: string }) => (
    <a href={to ?? '#'} {...rest}>
      {children}
    </a>
  ),
}));

// MonitorPreview pulls in streaming hooks. Replace with a sentinel.
vi.mock('@/components/monitors/MonitorPreview', () => ({
  MonitorPreview: ({ monitorId }: { monitorId: number }) => (
    <div data-testid="monitor-preview" data-monitor-id={monitorId} />
  ),
}));

const { ClassicMonitorsTable } = await import('./ClassicMonitorsTable');

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
    ...over,
  } as unknown as Monitor;
}

describe('ClassicMonitorsTable — empty state', () => {
  it('shows the "no monitors configured" hint when the list is empty', () => {
    render(
      <ClassicMonitorsTable monitors={[]} liveSessionIds={new Set()} />,
    );
    expect(screen.getByText(/no monitors configured/i)).toBeInTheDocument();
  });
});

describe('ClassicMonitorsTable — rows', () => {
  it('renders one row per monitor with id, name, resolution, source', () => {
    render(
      <ClassicMonitorsTable
        monitors={[
          makeMonitor({ id: 1, name: 'Front Door', host: '192.168.1.10', width: 1920, height: 1080 }),
          makeMonitor({ id: 2, name: 'Garage', host: '192.168.1.11', width: 1280, height: 720 }),
        ]}
        liveSessionIds={new Set()}
      />,
    );
    expect(screen.getByText('Front Door')).toBeInTheDocument();
    expect(screen.getByText('Garage')).toBeInTheDocument();
    expect(screen.getByText('1920×1080')).toBeInTheDocument();
    expect(screen.getByText('1280×720')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.10')).toBeInTheDocument();
  });

  it('renders the Function column joining capturing/analysing/recording', () => {
    render(
      <ClassicMonitorsTable
        monitors={[makeMonitor({ capturing: 'Always', analysing: 'Always', recording: 'OnMotion' })]}
        liveSessionIds={new Set()}
      />,
    );
    expect(screen.getByText(/Always \/ Always \/ OnMotion/)).toBeInTheDocument();
  });
});

describe('ClassicMonitorsTable — status badges', () => {
  it('renders the Capturing badge when capturing !== None', () => {
    render(
      <ClassicMonitorsTable
        monitors={[makeMonitor({ capturing: 'Always' })]}
        liveSessionIds={new Set()}
      />,
    );
    expect(screen.getByText('Capturing')).toBeInTheDocument();
  });

  it('renders the Idle badge when capturing === None', () => {
    render(
      <ClassicMonitorsTable
        monitors={[makeMonitor({ capturing: 'None' })]}
        liveSessionIds={new Set()}
      />,
    );
    expect(screen.getByText('Idle')).toBeInTheDocument();
  });

  it('renders the Live badge when the monitor id is in liveSessionIds', () => {
    render(
      <ClassicMonitorsTable
        monitors={[makeMonitor({ id: 1 })]}
        liveSessionIds={new Set([1])}
      />,
    );
    expect(screen.getByText('Live')).toBeInTheDocument();
  });
});

describe('ClassicMonitorsTable — actions', () => {
  it('omits the Clone / Delete buttons when no handlers are passed', () => {
    render(
      <ClassicMonitorsTable
        monitors={[makeMonitor({ id: 1, name: 'Front Door' })]}
        liveSessionIds={new Set()}
      />,
    );
    expect(screen.queryByRole('button', { name: /clone/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  });

  it('calls onClone with the monitor id when the Clone button is clicked', async () => {
    const user = userEvent.setup();
    const onClone = vi.fn();
    render(
      <ClassicMonitorsTable
        monitors={[makeMonitor({ id: 5, name: 'Front Door' })]}
        liveSessionIds={new Set()}
        onClone={onClone}
      />,
    );
    await user.click(screen.getByRole('button', { name: /clone front door/i }));
    expect(onClone).toHaveBeenCalledWith(5);
  });

  it('calls onDelete with the id + name when the Delete button is clicked', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <ClassicMonitorsTable
        monitors={[makeMonitor({ id: 5, name: 'Front Door' })]}
        liveSessionIds={new Set()}
        onDelete={onDelete}
      />,
    );
    await user.click(screen.getByRole('button', { name: /delete front door/i }));
    expect(onDelete).toHaveBeenCalledWith(5, 'Front Door');
  });

  it('disables action buttons while busy=true', () => {
    render(
      <ClassicMonitorsTable
        monitors={[makeMonitor({ id: 5, name: 'Front Door' })]}
        liveSessionIds={new Set()}
        onClone={() => {}}
        onDelete={() => {}}
        busy
      />,
    );
    expect(screen.getByRole('button', { name: /clone front door/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /delete front door/i })).toBeDisabled();
  });
});

describe('ClassicMonitorsTable — runtime status badge', () => {
  it('shows the capture-process state and fps when the status poll has answered', () => {
    render(
      <ClassicMonitorsTable
        monitors={[makeMonitor({ id: 1, capturing: 'Always' })]}
        liveSessionIds={new Set()}
        runtimeById={{ 1: { monitorId: 1, status: 'NotRunning', captureFps: 0, analysisFps: 0, captureFpsRaw: '0', analysisFpsRaw: '0', bandwidth: 0, updatedOn: '' } }}
      />,
    );
    const badge = screen.getByTestId('monitor-status-1');
    expect(badge).toHaveTextContent('NotRunning');
    expect(badge).toHaveTextContent('0.0 fps');
    expect(badge.className).toContain('text-red-700');
  });
});
