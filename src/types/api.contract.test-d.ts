/**
 * Compile-time guard on the hand-written API shapes (W1).
 *
 * `src/types/index.ts` is written by hand, and the review found several
 * shapes that had quietly drifted from the backend — `ZmEvent.length` typed
 * `number` when the API sends a decimal string was enough to make the
 * Reports chart sum to zero (F-12). `src/api/contract.test.ts` already
 * checks that every wrapper's *method and path* exist in the spec; nothing
 * checked the *shapes*.
 *
 * This file does, and it costs nothing at runtime: every assertion below is
 * a type-level check that `tsc -b` evaluates. A field whose declared type
 * stops matching the generated one is a build error naming the field.
 *
 * Regenerate with `npm run types:generate` after refreshing the OpenAPI
 * snapshot. Deliberate divergences are listed and justified, not silently
 * allowed — see `MonitorOmissions` below.
 */
import type { components } from './api.generated';
import type { Monitor, ZmEvent, User } from './index';

type Schemas = components['schemas'];

/**
 * For every key we declare that the spec also declares, our type must accept
 * the spec's type. Keys we do not declare are not an error — the UI is free
 * to use a subset — but a key we declare *differently* is.
 */
type Mismatched<Ours, Theirs> = {
  [K in keyof Ours & keyof Theirs as Theirs[K] extends Ours[K] ? never : K]: {
    ours: Ours[K];
    spec: Theirs[K];
  };
};

/** Fails with the offending field names in the error message. */
type AssertNoDrift<T extends Record<string, never>> = T;

/**
 * Write-only credentials. The backend stopped returning these (zm-api#18
 * made camera secrets write-only) but the editor still posts them, so they
 * stay on our request-shaped type and are excluded from the response check.
 */
type MonitorOmissions = 'pass' | 'onvif_password';

export type MonitorDrift = AssertNoDrift<
  Mismatched<Omit<Monitor, MonitorOmissions>, Schemas['MonitorResponse']>
>;
export type EventDrift = AssertNoDrift<Mismatched<ZmEvent, Schemas['EventResponse']>>;
export type UserDrift = AssertNoDrift<Mismatched<User, Schemas['UserResponse']>>;

