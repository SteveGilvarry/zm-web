/**
 * The fixture layer, checked against the OpenAPI snapshot.
 *
 * Fixtures are only useful while they look like the backend. This test is
 * what keeps them honest: every factory's output is validated against its
 * response schema — required keys present, JSON types right, enums inside
 * their vocabulary, and no key the schema does not declare (a typo'd field
 * name would otherwise sit in a fixture forever, passing tests the real API
 * would fail).
 *
 * There is no ajv in this project and adding one is not worth it: the slice
 * of JSON Schema the snapshot uses is `required` + `type` + `enum` + `$ref` +
 * nullable `oneOf`, which `validate()` below covers in ~50 lines.
 *
 * Refresh the snapshot from `<backend>/api-docs/openapi.json` when the
 * backend changes; see legacy-requirements/review-2026-08-21/.
 */
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  makeConfig,
  makeControl,
  makeDaemon,
  makeEvent,
  makeFilter,
  makeFrame,
  makeGroup,
  makeGroupMonitor,
  makeLog,
  makeMonitor,
  makeMonitorStatus,
  makeMontageLayout,
  makePtzCapabilities,
  makePtzStatus,
  makeReport,
  makeServer,
  makeServerStat,
  makeState,
  makeStorage,
  makeSystemStats,
  makeSystemStatus,
  makeTag,
  makeUser,
  makeVersion,
  makeZone,
  paginated,
} from './index';

/* ------------------------------------------------------------------------ */
/*  Spec                                                                    */
/* ------------------------------------------------------------------------ */

const SPEC_PATH = resolvePath(
  __dirname,
  '../../../legacy-requirements/review-2026-08-21/openapi-2026-08-21.json',
);

interface Schema {
  $ref?: string;
  allOf?: Schema[];
  oneOf?: Schema[];
  anyOf?: Schema[];
  type?: string | string[];
  enum?: unknown[];
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
}

const spec: { components: { schemas: Record<string, Schema> } } = JSON.parse(
  readFileSync(SPEC_PATH, 'utf8'),
);
const schemas = spec.components.schemas;

/**
 * Follow `$ref` / nullable `oneOf` to the real schema, and flatten a
 * multi-member `allOf` (how the spec composes `PtzCapabilitiesResponse`)
 * into one object schema so its `required` and `properties` are visible.
 */
function deref(s: Schema | undefined): Schema | undefined {
  if (!s) return undefined;
  if (s.$ref) return deref(schemas[s.$ref.split('/').pop()!]);
  const members = (s.allOf ?? s.oneOf ?? s.anyOf)?.filter((m) => m.type !== 'null');
  if (!members || members.length === 0) return s;
  if (members.length === 1) return deref(members[0]);
  if (!s.allOf) return s;
  const merged: Schema = { type: 'object', properties: {}, required: [] };
  for (const member of s.allOf) {
    const m = deref(member);
    Object.assign(merged.properties!, m?.properties ?? {});
    merged.required!.push(...(m?.required ?? []));
  }
  return merged;
}

function nullable(s: Schema): boolean {
  if (Array.isArray(s.type)) return s.type.includes('null');
  return Boolean((s.oneOf ?? s.anyOf)?.some((m) => m.type === 'null'));
}

function typeMatches(type: string, value: unknown): boolean {
  switch (type) {
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'number':
      return typeof value === 'number';
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'null':
      return value === null;
    default:
      return true;
  }
}

/** Structural validation; returns a list of human-readable problems. */
function validate(value: unknown, schema: Schema | undefined, path = '$'): string[] {
  const s = deref(schema);
  if (!s) return [];
  if (value === null) {
    // Nullability lives on the wrapper (`oneOf: [{type: null}, {$ref}]`),
    // which `deref` collapses away — so ask the original schema too.
    const ok = nullable(schema!) || nullable(s);
    return ok ? [] : [`${path}: null but schema is not nullable`];
  }

  const types = (Array.isArray(s.type) ? s.type : s.type ? [s.type] : []).filter(
    (t) => t !== 'null',
  );
  if (types.length > 0 && !types.some((t) => typeMatches(t, value))) {
    return [`${path}: expected ${types.join('|')}, got ${describe_(value)}`];
  }
  if (s.enum && !s.enum.includes(value as never)) {
    return [`${path}: ${JSON.stringify(value)} is not one of ${JSON.stringify(s.enum)}`];
  }

  const errors: string[] = [];
  if (Array.isArray(value) && s.items) {
    value.forEach((item, i) => errors.push(...validate(item, s.items, `${path}[${i}]`)));
    return errors;
  }
  if (s.properties && typeof value === 'object' && !Array.isArray(value)) {
    const row = value as Record<string, unknown>;
    for (const key of s.required ?? []) {
      if (!(key in row)) errors.push(`${path}.${key}: required but missing`);
    }
    for (const [key, raw] of Object.entries(row)) {
      const prop = s.properties[key];
      if (!prop) {
        errors.push(`${path}.${key}: not declared by the schema`);
        continue;
      }
      if (raw === undefined) continue;
      errors.push(...validate(raw, prop, `${path}.${key}`));
    }
  }
  return errors;
}

function describe_(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

/* ------------------------------------------------------------------------ */
/*  Factories                                                               */
/* ------------------------------------------------------------------------ */

/** Every factory, with the response schema its output must satisfy. */
const CASES: Array<[name: string, schema: string, value: unknown]> = [
  ['makeMonitor', 'MonitorResponse', makeMonitor()],
  ['makeMonitorStatus', 'MonitorStatusResponse', makeMonitorStatus()],
  ['makeControl', 'ControlResponse', makeControl()],
  ['makeZone', 'ZoneResponse', makeZone()],
  ['makeEvent', 'EventResponse', makeEvent()],
  ['makeFrame', 'FrameResponse', makeFrame()],
  ['makeTag', 'TagResponse', makeTag()],
  ['makeUser', 'UserResponse', makeUser()],
  ['makeGroup', 'GroupResponse', makeGroup()],
  ['makeGroupMonitor', 'GroupMonitorResponse', makeGroupMonitor()],
  ['makeFilter', 'FilterResponse', makeFilter()],
  ['makeLog', 'LogResponse', makeLog()],
  ['makeConfig', 'ConfigResponse', makeConfig()],
  ['makeStorage', 'StorageResponse', makeStorage()],
  ['makeServer', 'ServerResponse', makeServer()],
  ['makeState', 'StateResponse', makeState()],
  ['makeReport', 'ReportResponse', makeReport()],
  ['makeMontageLayout', 'MontageLayoutResponse', makeMontageLayout()],
  ['makePtzCapabilities', 'PtzCapabilitiesResponse', makePtzCapabilities()],
  ['makePtzStatus', 'PtzStatusResponse', makePtzStatus()],
  ['makeDaemon', 'DaemonStatusResponse', makeDaemon()],
  ['makeSystemStats', 'SystemStatsResponse', makeSystemStats()],
  ['makeSystemStatus', 'SystemStatusResponse', makeSystemStatus()],
  ['makeVersion', 'VersionResponse', makeVersion()],
  ['makeServerStat', 'ServerStatResponse', makeServerStat()],
  ['paginated(monitors)', 'PaginatedMonitorsResponse', paginated([makeMonitor()])],
  ['paginated(events)', 'PaginatedEventsResponse', paginated([makeEvent()], { per_page: 20 })],
  ['paginated(logs)', 'PaginatedLogsResponse', paginated([makeLog()])],
];

describe('fixtures match the OpenAPI snapshot', () => {
  it.each(CASES)('%s satisfies %s', (_name, schemaName, value) => {
    expect(schemas[schemaName], `${schemaName} missing from the snapshot`).toBeDefined();
    expect(validate(value, schemas[schemaName])).toEqual([]);
  });

  it('every factory in the barrel has a case here', async () => {
    const barrel = await import('./index');
    const factories = Object.keys(barrel).filter((k) => k.startsWith('make'));
    const covered = new Set(CASES.map(([name]) => name));
    expect(factories.filter((f) => !covered.has(f))).toEqual([]);
  });

  it('rejects a fixture that drifts from the schema', () => {
    // The validator earns its keep only if it actually fails: a monitor with
    // a string where an int belongs, a missing required key, and a stray
    // field must all be caught.
    const bad = { ...makeMonitor(), width: '1920', bogus_column: 1 } as unknown;
    delete (bad as Record<string, unknown>).name;
    const errors = validate(bad, schemas.MonitorResponse);
    expect(errors).toContain('$.name: required but missing');
    expect(errors).toContain('$.width: expected integer, got string');
    expect(errors).toContain('$.bogus_column: not declared by the schema');
  });
});
