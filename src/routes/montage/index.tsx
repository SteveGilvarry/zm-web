import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

/**
 * Legacy `?view=montage` request params:
 * - `group` pre-applies a group filter;
 * - `layout` selects a MontageLayouts row (`zmMontageLayout`);
 * - `show_zones` 1/0 (`showZones`);
 * - `status_position` (`monitorStatusPositionSelected`, legacy or short values);
 * - `header` `0` / `hidden` hides the control band (kiosk).
 */
interface MontageSearchParams {
  group?: number;
  layout?: number;
  show_zones?: 0 | 1;
  status_position?: string;
  header?: string;
}

export const Route = createFileRoute('/montage/')({
  component: () => <SkinPage page="montage" />,
  validateSearch: (search: Record<string, unknown>): MontageSearchParams => ({
    group: toInt(search.group),
    layout: toInt(search.layout),
    show_zones: search.show_zones === 1 || search.show_zones === '1' ? 1
      : search.show_zones === 0 || search.show_zones === '0' ? 0 : undefined,
    status_position: typeof search.status_position === 'string' && search.status_position ? search.status_position : undefined,
    header: search.header === 0 ? '0' : typeof search.header === 'string' && search.header ? search.header : undefined,
  }),
});

function toInt(v: unknown): number | undefined {
  const n = Number(v);
  return v != null && v !== '' && Number.isInteger(n) && n > 0 ? n : undefined;
}
