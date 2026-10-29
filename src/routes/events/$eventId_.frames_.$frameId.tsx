import { createFileRoute } from '@tanstack/react-router';
import { EventFrameRoute } from '@/features/nav/routeComponents';

/**
 * Legacy `?view=frame&eid=&fid=`; frame 0 is the max-score frame. Both
 * underscores un-nest it: neither the event page nor the frames table
 * renders an <Outlet/>.
 */
export const Route = createFileRoute('/events/$eventId_/frames_/$frameId')({
  component: EventFrameRoute,
});
