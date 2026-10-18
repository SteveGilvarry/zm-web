import type { EventsSearchParams } from './eventsSearch';

/**
 * Link props for the events toolbar's Timeline button: `/timeline` with the
 * list's filters (legacy's `tlineBtn` carries `filterQuery`, events.js:383).
 *
 * The timeline route is built separately, so it is not in the generated
 * route tree this module is checked against; the casts keep the button
 * compiling either way. Once the route exists the link resolves to it.
 */
export function timelineLink(search: Partial<EventsSearchParams>): { to: '/'; search: never } {
  return { to: '/timeline' as '/', search: search as never };
}
