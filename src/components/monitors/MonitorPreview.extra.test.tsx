/**
 * The snapshot <img> hides itself when the frame fails to load, so a dead
 * camera falls back to the placeholder icon instead of showing a broken image.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const inViewportMock = vi.fn();
const snapshotMock = vi.fn();
vi.mock('@/hooks/useInViewport', () => ({ useInViewport: () => inViewportMock() }));
vi.mock('@/hooks/useRefreshingSnapshot', () => ({
  useRefreshingSnapshot: (id: number, enabled: boolean) => snapshotMock(id, enabled),
}));
vi.mock('@/components/common/StreamCell', () => ({
  StreamCell: (props: { monitorId: number }) => (
    <div data-testid="live-stream-cell" data-monitor-id={props.monitorId} />
  ),
}));

import { MonitorPreview } from './MonitorPreview';

beforeEach(() => {
  inViewportMock.mockReset().mockReturnValue(true);
  snapshotMock.mockReset().mockReturnValue('blob:fake-snapshot');
});

describe('MonitorPreview — snapshot load state', () => {
  it('reveals the frame once it decodes and hides it when the fetch fails', () => {
    render(<MonitorPreview monitorId={4} monitorName="Garage" isActive />);
    const img = screen.getByRole('img', { name: 'Garage' });

    fireEvent.load(img);
    expect(img.style.visibility).toBe('visible');

    fireEvent.error(img);
    expect(img.style.visibility).toBe('hidden');
  });

  it('still hides a failed frame when the camera is rotated and filling its parent', () => {
    render(
      <MonitorPreview
        monitorId={4}
        monitorName="Garage"
        orientation="ROTATE_90"
        rotationFit="fill"
        isActive
      />,
    );
    const img = screen.getByRole('img', { name: 'Garage' });
    expect(img.style.transform).toContain('rotate(90deg)');

    fireEvent.error(img);
    expect(img.style.visibility).toBe('hidden');
  });
});
