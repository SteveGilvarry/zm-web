import { createFileRoute } from '@tanstack/react-router';
import { SkinPage } from '@/skins/SkinPage';
import { parseTimelineSearch } from '@/features/timeline/timelineSearch';

/**
 * Legacy `?view=timeline`: the events filter plus the chart's window
 * (`min_time`, `max_time`, or `mid_time` + `range` in seconds).
 */
export const Route = createFileRoute('/timeline/')({
  component: () => <SkinPage page="timeline" />,
  validateSearch: parseTimelineSearch,
});
