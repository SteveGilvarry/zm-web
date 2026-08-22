import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

/** `?new=true` — legacy `?view=monitor` with no id — opens the Add dialog. */
interface MonitorsSearchParams {
  new?: boolean;
}

export const Route = createFileRoute('/monitors/')({
  component: () => <SkinPage page="monitors.list" />,
  validateSearch: (search: Record<string, unknown>): MonitorsSearchParams => ({
    new: search.new === true || search.new === 'true' || search.new === 1 || search.new === '1' ? true : undefined,
  }),
});
