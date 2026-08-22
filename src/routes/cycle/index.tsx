import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';

/** `?monitor_id=` — legacy `?view=cycle&mid=` — starts the rotation on that monitor. */
interface CycleSearchParams {
  monitor_id?: number;
}

export const Route = createFileRoute('/cycle/')({
  component: () => <SkinPage page="cycle" />,
  validateSearch: (search: Record<string, unknown>): CycleSearchParams => ({
    monitor_id: toInt(search.monitor_id),
  }),
});

function toInt(v: unknown): number | undefined {
  const n = Number(v);
  return v != null && v !== '' && Number.isInteger(n) && n > 0 ? n : undefined;
}
