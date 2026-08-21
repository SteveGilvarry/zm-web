/**
 * Shared response fixtures.
 *
 * One factory per backend resource, each returning the *full* required field
 * set of its `…Response` schema in the OpenAPI snapshot
 * (`legacy-requirements/review-2026-08-21/openapi-2026-08-21.json`) with the
 * values the live box actually sends — 0/1 ints for booleans, decimals as
 * strings, raw DB enum casing on monitor reads. `fixtures.schema.test.ts`
 * checks every factory against that snapshot, so a backend change that
 * invalidates a fixture fails there rather than in a hundred page tests.
 *
 * Every factory takes an overrides object: `makeEvent({ archived: 1 })`.
 */
export { paginated, emptyPage } from './pagination';
export { makeMonitor, makeMonitorStatus, makeControl, makeZone } from './monitors';
export { makeEvent, makeFrame, makeTag } from './events';
export {
  makeUser,
  makeGroup,
  makeGroupMonitor,
  makeFilter,
  makeLog,
  makeConfig,
  makeStorage,
  makeServer,
  makeState,
  makeReport,
  makeMontageLayout,
} from './admin';
export {
  makeDaemon,
  makeSystemStats,
  makeSystemStatus,
  makeVersion,
  makeServerStat,
} from './system';
export { makePtzCapabilities, makePtzStatus } from './ptz';
export type { SystemStatusFixture } from './system';
