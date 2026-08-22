import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

export interface PtzControlsSearch {
  /** `new` opens the create form; a profile id opens its editor (legacy `?view=controlcap&cid=`). */
  id?: number | 'new';
}

export const Route = createFileRoute('/settings/ptz-controls')({
  component: () => <SkinPage page="settings.ptzControls" />,
  validateSearch: (search: Record<string, unknown>): PtzControlsSearch => {
    const raw = search.id;
    if (raw === 'new') return { id: 'new' };
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    return Number.isInteger(n) && n > 0 ? { id: n } : {};
  },
});
