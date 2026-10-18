/**
 * Starting values for the editor's create mode: legacy Add
 * (`?view=monitor`) and Clone (`?view=monitor&dupId=N`). Pure, so the
 * console, the monitors list and discovery all seed the same way.
 */
import { MONITOR_CREATE_DEFAULTS, toCreatePayload, type MonitorCreatePayload } from '@/api/monitors-crud';
import type { Monitor } from '@/types';
import { randomHexColour } from './editorState';
import type { MonitorEditorSeed } from './useMonitorEditor';

/**
 * Where the legacy new-monitor form differs from the row defaults: the
 * values `monitor.php` renders for a new monitor on the 1.39.41 box
 * (captured `monitor_new.html`). Merged over `MONITOR_CREATE_DEFAULTS`, so
 * a monitor added here starts where one added in the PHP UI would.
 */
export const LEGACY_NEW_MONITOR: Partial<MonitorCreatePayload> = {
  function: 'Mocord',
  recording: 'Always',
  video_writer: 2,
  max_image_buffer_count: 121,
  pre_event_count: 5,
  min_section_length: 10,
  event_close_mode: 'system',
  fps_report_interval: 100,
  label_size: 2,
  janus_rtsp_session_timeout: 0,
  onvif_events_path: '/Events',
  onvif_alarm_text: 'MotionAlarm',
  signal_check_colour: '#0000BE',
};

type Named = Pick<Monitor, 'id' | 'name'>;

/**
 * Legacy names a new monitor `Monitor-<next id>` and appends `0` until the
 * name is free. The next id is the table's auto-increment; the highest id
 * we can see plus one is the closest the API lets us get.
 */
export function newMonitorName(existing: Named[], prefix = 'Monitor'): string {
  const next = existing.reduce((max, m) => Math.max(max, m.id), 0) + 1;
  const taken = new Set(existing.map((m) => m.name));
  let name = `${prefix}-${next}`;
  while (taken.has(name)) name += '0';
  return name;
}

/**
 * Legacy `monitor.php` names a clone `Clone of <name>`, and keeps prefixing
 * `Clone of ` until the name is free.
 */
export function cloneName(source: string, taken: Iterable<string>): string {
  const names = new Set(taken);
  let name = `Clone of ${source}`;
  while (names.has(name)) name = `Clone of ${name}`;
  return name;
}

/** Add: the box's defaults, a free `Monitor-N` name and a random web colour, plus any prefill (an ONVIF profile). */
export function newMonitorSeed(
  existing: Named[],
  prefill: Partial<MonitorCreatePayload> = {},
  options: { prefix?: string; rand?: () => number } = {},
): MonitorEditorSeed {
  const values: MonitorCreatePayload = {
    ...MONITOR_CREATE_DEFAULTS,
    ...LEGACY_NEW_MONITOR,
    name: newMonitorName(existing, options.prefix),
    web_colour: randomHexColour(options.rand),
  };
  for (const [k, v] of Object.entries(prefill)) {
    if (v !== undefined && v !== '') (values as Record<string, unknown>)[k] = v;
  }
  return { values };
}

/** Clone: every setting and the groups of `source`, under a free `Clone of …` name. */
export function cloneSeed(source: Monitor, existing: Named[]): MonitorEditorSeed {
  return {
    values: toCreatePayload(source, { name: cloneName(source.name, existing.map((m) => m.name)) }),
    clonedFrom: source.name,
    groupsFrom: source.id,
  };
}
