import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import type { Monitor } from '@/types';
import { heightOptions, SCALE_VALUES, widthOptions, type StageSize } from '@/features/monitors/watchStage';
import { ClassicSelect } from './Select';

interface StageSizeSelectsProps {
  stage: {
    size: StageSize;
    setWidth: (v: string) => void;
    setHeight: (v: string) => void;
    setScale: (v: string) => void;
  };
  /** Monitors whose native sizes join the option lists. */
  monitors: Array<Pick<Monitor, 'width' | 'height' | 'orientation'>>;
  tone?: 'light' | 'dark';
  className?: string;
}

/** Legacy `Width [▼] Height [▼] Scale [▼]` trio (watch / cycle / montage). */
export function StageSizeSelects({ stage, monitors, tone = 'light', className }: StageSizeSelectsProps) {
  const { t } = useTranslation();
  const scaleLabel = (v: string): string => {
    switch (v) {
      case '0': return t('Auto');
      case '100': return t('Actual');
      case 'fit_to_width': return t('Fit to width');
      default: return t('Max {{size}}', { size: v });
    }
  };
  const cls = clsx(tone === 'dark' && 'text-white', className);
  return (
    <div className={clsx('flex flex-wrap items-center gap-3', cls)} role="group" aria-label={t('Stage size')}>
      <ClassicSelect
        label={t('Width')}
        value={stage.size.width}
        onChange={stage.setWidth}
        options={widthOptions(monitors).map((v) => ({ value: v, label: v === 'auto' ? t('auto') : v }))}
      />
      <ClassicSelect
        label={t('Height')}
        value={stage.size.height}
        onChange={stage.setHeight}
        options={heightOptions(monitors).map((v) => ({ value: v, label: v === 'auto' ? t('auto') : v }))}
      />
      <ClassicSelect
        label={t('Scale')}
        value={stage.size.scale}
        onChange={stage.setScale}
        options={SCALE_VALUES.map((v) => ({ value: v, label: scaleLabel(v) }))}
      />
    </div>
  );
}
