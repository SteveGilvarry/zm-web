import type { MonitorPreset } from '@/api/monitorPresets';
import type { MonitorCreateInput } from '@/api/monitors-crud';
import { canonicalEnum, MONITOR_ENUMS } from '@/api/monitors';

/** The presets table stores the literal string `NULL` in some text columns. */
function text(v: string | null | undefined): string | undefined {
  if (v == null || v === 'NULL') return undefined;
  return v;
}

function num(v: number | null | undefined): number | undefined {
  return v == null ? undefined : v;
}

/**
 * What a legacy monitor preset contributes to the new-monitor form — the
 * same column list `monitor.php` copies (`Type, Device, Channel, Format,
 * Protocol, Method, Host, Port, Path, Width, Height, Palette, MaxFPS,
 * Controllable, ControlId, ControlDevice, ControlAddress, DefaultRate,
 * DefaultScale`). Keys the preset leaves empty are omitted so the form keeps
 * what the operator already typed.
 */
export function applyPreset(preset: MonitorPreset): Partial<MonitorCreateInput> {
  const out: Partial<MonitorCreateInput> = {};
  const type = canonicalEnum(preset.type, MONITOR_ENUMS.type);
  if ((MONITOR_ENUMS.type as readonly string[]).includes(type)) out.type = type as MonitorCreateInput['type'];
  const strings: Array<keyof Pick<MonitorPreset, 'device' | 'protocol' | 'method' | 'host' | 'port' | 'path' | 'sub_path' | 'control_device' | 'control_address' | 'default_scale'>> =
    ['device', 'protocol', 'method', 'host', 'port', 'path', 'sub_path', 'control_device', 'control_address', 'default_scale'];
  for (const k of strings) {
    const v = text(preset[k]);
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  const numbers: Array<keyof Pick<MonitorPreset, 'channel' | 'format' | 'width' | 'height' | 'palette' | 'max_fps' | 'controllable' | 'default_rate' | 'model_id'>> =
    ['channel', 'format', 'width', 'height', 'palette', 'max_fps', 'controllable', 'default_rate', 'model_id'];
  for (const k of numbers) {
    const v = num(preset[k]);
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  // `control_id` is text in the presets table but an integer FK on monitors.
  const cid = text(preset.control_id);
  if (cid !== undefined && /^\d+$/.test(cid)) out.control_id = Number(cid);
  return out;
}
