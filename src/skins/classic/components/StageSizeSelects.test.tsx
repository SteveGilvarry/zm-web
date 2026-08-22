/**
 * The legacy `Width [▼] Height [▼] Scale [▼]` trio shared by watch, cycle
 * and montage.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/render';
import { StageSizeSelects } from './StageSizeSelects';
import type { StageSize } from '@/features/monitors/watchStage';

const monitors = [
  { width: 1920, height: 1080, orientation: 'ROTATE_0' },
  // Rotated: the *displayed* size is 1080x1920, so those are the values offered.
  { width: 1920, height: 1080, orientation: 'ROTATE_90' },
];

function mount(size: Partial<StageSize> = {}, tone?: 'light' | 'dark') {
  const stage = {
    size: { width: 'auto', height: 'auto', scale: '0', ...size },
    setWidth: vi.fn(),
    setHeight: vi.fn(),
    setScale: vi.fn(),
  };
  const view = renderWithProviders(
    <StageSizeSelects stage={stage} monitors={monitors} tone={tone} className="mb-2" />,
  );
  return { stage, ...view };
}

const optionValues = (select: HTMLElement) =>
  within(select).getAllByRole('option').map((o) => (o as HTMLOptionElement).value);

describe('StageSizeSelects', () => {
  it('groups the three selects under one accessible name', () => {
    mount();
    const group = screen.getByRole('group', { name: 'Stage size' });
    expect(within(group).getAllByRole('combobox')).toHaveLength(3);
  });

  it('appends each camera’s displayed size to the width and height lists', () => {
    mount();
    expect(optionValues(screen.getByRole('combobox', { name: 'Width' })))
      .toEqual(['auto', '100%', '160px', '320px', '352px', '640px', '1280px', '1920px', '1080px']);
    expect(optionValues(screen.getByRole('combobox', { name: 'Height' })))
      .toEqual(['auto', '240px', '480px', '720px', '1080px', '1920px']);
  });

  it('renders `auto` as a translated label rather than a raw wire value', () => {
    mount();
    const width = screen.getByRole('combobox', { name: 'Width' });
    expect(within(width).getByRole('option', { name: 'auto' })).toHaveValue('auto');
    expect(within(width).getByRole('option', { name: '640px' })).toHaveValue('640px');
  });

  it('labels the scale sentinels and formats the max-width entries', () => {
    mount();
    const scale = screen.getByRole('combobox', { name: 'Scale' });
    expect(within(scale).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Auto', 'Actual', 'Fit to width',
      'Max 480px', 'Max 640px', 'Max 800px', 'Max 1024px', 'Max 1280px', 'Max 1600px',
    ]);
  });

  it('shows the current selection for each axis', () => {
    mount({ width: '640px', height: '480px', scale: 'fit_to_width' });
    expect(screen.getByRole('combobox', { name: 'Width' })).toHaveValue('640px');
    expect(screen.getByRole('combobox', { name: 'Height' })).toHaveValue('480px');
    expect(screen.getByRole('combobox', { name: 'Scale' })).toHaveValue('fit_to_width');
  });

  it('reports each change to its own setter', async () => {
    const { stage } = mount({}, 'dark');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Width' }), '320px');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Height' }), '720px');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Scale' }), '100');

    expect(stage.setWidth).toHaveBeenCalledWith('320px');
    expect(stage.setHeight).toHaveBeenCalledWith('720px');
    expect(stage.setScale).toHaveBeenCalledWith('100');
  });

  it('offers only the base sizes when no monitors are known', () => {
    const stage = {
      size: { width: 'auto', height: 'auto', scale: '0' },
      setWidth: vi.fn(), setHeight: vi.fn(), setScale: vi.fn(),
    };
    renderWithProviders(<StageSizeSelects stage={stage} monitors={[]} />);
    expect(optionValues(screen.getByRole('combobox', { name: 'Height' })))
      .toEqual(['auto', '240px', '480px', '720px', '1080px']);
  });
});
