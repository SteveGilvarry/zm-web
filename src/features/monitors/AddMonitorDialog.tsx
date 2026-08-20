import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Plus, X, Loader2, Camera } from 'lucide-react';
import { createMonitor, type MonitorCreateInput } from '@/api/monitors-crud';
import { ApiClientError } from '@/api/client';
import { useToast } from '@/components/common/toastStore';
import type { Monitor } from '@/types';
import { fieldErrorsFromDetails, type FieldErrors } from './editor/fields';
import { PresetPicker } from './presets/PresetPicker';
import { applyPreset } from './presets/applyPreset';

interface AddMonitorDialogProps {
  open: boolean;
  onClose: () => void;
  /** Values to start the form with — ONVIF discovery hands over a prefilled source. */
  initial?: Partial<MonitorCreateInput>;
  /** Called with the created monitor before the dialog closes. */
  onCreated?: (monitor: Monitor) => void;
}

type MonitorType = NonNullable<MonitorCreateInput['type']>;
type TypeOption = { value: MonitorType; label: string; desc: string };
type FunctionOption = { value: NonNullable<MonitorCreateInput['function']>; label: string };

/** Option labels are built inside a hook so `t()` sees literal keys. */
function useMonitorOptions(): { types: TypeOption[]; functions: FunctionOption[] } {
  const { t } = useTranslation();
  return {
    types: [
      { value: 'Ffmpeg',  label: t('FFmpeg'),  desc: t('Generic RTSP/RTMP/HTTP via libav.') },
      { value: 'Libvlc',  label: t('libVLC'),  desc: t('libVLC backend — handy for awkward streams.') },
      { value: 'Remote',  label: t('Remote'),  desc: t('Direct HTTP MJPEG / JPEG-pull cameras.') },
      { value: 'Local',   label: t('Local'),   desc: t('V4L2 capture card or USB camera on this server.') },
      { value: 'File',    label: t('File'),    desc: t('Loop a local video file (testing).') },
      { value: 'Curl',    label: t('cURL'),    desc: t('Poll a still-image URL.') },
      { value: 'WebSite', label: t('Website'), desc: t('Embed a web page in the montage.') },
      { value: 'Vnc',     label: t('VNC'),     desc: t('Capture a VNC desktop.') },
    ],
    functions: [
      { value: 'Monitor', label: t('Monitor (live view only)') },
      { value: 'Modect',  label: t('Modect (motion detect + record)') },
      { value: 'Record',  label: t('Record (continuous)') },
      { value: 'Mocord',  label: t('Mocord (continuous + motion-tag)') },
      { value: 'Nodect',  label: t('Nodect (no motion, no record)') },
    ],
  };
}

/** Which source rows each type needs — the legacy form's per-type Source tab, reduced to the essentials. */
const SHOWS: Record<'host' | 'path' | 'auth' | 'device' | 'protocol' | 'refresh', MonitorType[]> = {
  host:     ['Remote', 'Vnc'],
  path:     ['Ffmpeg', 'Libvlc', 'Remote', 'File', 'Curl', 'WebSite'],
  auth:     ['Ffmpeg', 'Libvlc', 'Remote', 'Curl', 'Vnc'],
  device:   ['Local'],
  protocol: ['Remote'],
  refresh:  ['WebSite'],
};

const DEFAULT_FORM: MonitorCreateInput = {
  name: '',
  type: 'Ffmpeg',
  host: '',
  port: '',
  user: '',
  pass: '',
  path: '',
  device: '',
  protocol: '',
  width: 1920,
  height: 1080,
  function: 'Modect',
};

/**
 * Add-monitor wizard. Exposes the essentials operators actually fill in
 * (name, type, source, resolution, function) with the legacy preset picker;
 * everything else uses the factory defaults from MONITOR_CREATE_DEFAULTS.
 * The full editor opens on the watch page once the row exists.
 */
export function AddMonitorDialog({ open, onClose, initial, onCreated }: AddMonitorDialogProps) {
  if (!open) return null;
  return <AddMonitorForm onClose={onClose} initial={initial} onCreated={onCreated} />;
}

function AddMonitorForm({ onClose, initial, onCreated }: Omit<AddMonitorDialogProps, 'open'>) {
  const { t } = useTranslation();
  const { types, functions } = useMonitorOptions();
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<MonitorCreateInput>({ ...DEFAULT_FORM, ...initial });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const update = <K extends keyof MonitorCreateInput>(k: K, v: MonitorCreateInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const create = useMutation({
    mutationFn: () => createMonitor(form),
    onSuccess: (monitor) => {
      qc.invalidateQueries({ queryKey: ['monitors'] });
      toast.success(t('Monitor "{{name}}" created.', { name: monitor.name }));
      onCreated?.(monitor);
      onClose();
    },
    onError: (e: unknown) => {
      const fromApi = e instanceof ApiClientError ? fieldErrorsFromDetails(e.details) : {};
      setFieldErrors(fromApi);
      setError(e instanceof Error ? e.message : String(e));
      toast.apiError(e);
    },
  });

  const type = form.type ?? 'Ffmpeg';
  const shows = (row: keyof typeof SHOWS) => SHOWS[row].includes(type);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const errors: FieldErrors = {};
    if (!form.name.trim()) errors.name = t('Required.');
    if (!(Number(form.width) >= 1)) errors.width = t('Must be at least 1.');
    if (!(Number(form.height) >= 1)) errors.height = t('Must be at least 1.');
    if (form.port && !/^\d{1,5}$/.test(form.port)) errors.port = t('Port must be a number between 0 and 65535.');
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError(t('Fix the highlighted fields first.'));
      return;
    }
    create.mutate();
  };

  const input = (key: string, extra?: string) => clsx(
    'px-2 py-1 text-sm bg-surface border rounded text-text-primary focus:outline-none',
    fieldErrors[key] ? 'border-crimson/60 focus:border-crimson' : 'border-border-subtle focus:border-cyan/50',
    extra,
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('Add monitor')}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form
        onSubmit={submit}
        noValidate
        className="w-full max-w-2xl rounded-xl border border-cyan/40 bg-panel/95 backdrop-blur-md shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
      >
        <header className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Camera size={16} className="text-cyan" />
            <h2 className="text-sm font-semibold text-text-primary">{t('Add monitor')}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('Close')}
            className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
          >
            <X size={14} />
          </button>
        </header>

        <div className="p-5 space-y-4">
          {/* Presets */}
          <Row label={t('Preset')}>
            <PresetPicker
              onPick={(preset) => setForm((f) => ({ ...f, ...applyPreset(preset) }))}
              className={input('preset')}
            />
          </Row>

          {/* Identity */}
          <Row label={t('Name')} error={fieldErrors.name}>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder={t('Front Door')}
              aria-invalid={!!fieldErrors.name || undefined}
              className={input('name', 'flex-1')}
            />
          </Row>

          {/* Backend kind */}
          <Row label={t('Type')}>
            <select
              value={type}
              onChange={(e) => update('type', e.target.value as MonitorType)}
              className={input('type', 'flex-1')}
            >
              {types.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} — {opt.desc}
                </option>
              ))}
            </select>
          </Row>

          {/* Function */}
          <Row label={t('Function')}>
            <select
              value={form.function}
              onChange={(e) => update('function', e.target.value as MonitorCreateInput['function'])}
              className={input('function', 'flex-1')}
            >
              {functions.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </Row>

          {/* Source */}
          <div className="space-y-2 rounded-md bg-surface/40 p-3 border border-border-subtle">
            <h3 className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
              {t('Source')}
            </h3>
            {shows('device') && (
              <Row label={t('Device')}>
                <input
                  value={form.device ?? ''}
                  onChange={(e) => update('device', e.target.value)}
                  placeholder="/dev/video0"
                  className={input('device', 'flex-1 font-mono')}
                />
              </Row>
            )}
            {shows('protocol') && (
              <Row label={t('Protocol')}>
                <select
                  value={form.protocol ?? ''}
                  onChange={(e) => update('protocol', e.target.value)}
                  className={input('protocol', 'flex-1')}
                >
                  <option value="">{t('Auto')}</option>
                  <option value="http">{t('HTTP')}</option>
                  <option value="rtsp">{t('RTSP')}</option>
                </select>
              </Row>
            )}
            {shows('host') && (
              <Row label={t('Host')} error={fieldErrors.port}>
                <input
                  value={form.host ?? ''}
                  onChange={(e) => update('host', e.target.value)}
                  placeholder={t('192.168.1.100')}
                  className={input('host', 'flex-1 font-mono')}
                />
                <input
                  value={form.port ?? ''}
                  onChange={(e) => update('port', e.target.value)}
                  placeholder={t('port')}
                  aria-label={t('Port')}
                  aria-invalid={!!fieldErrors.port || undefined}
                  className={input('port', 'w-20 font-mono')}
                />
              </Row>
            )}
            {shows('path') && (
              <Row label={type === 'WebSite' || type === 'Curl' ? t('URL') : t('Path')}>
                <input
                  value={form.path ?? ''}
                  onChange={(e) => update('path', e.target.value)}
                  placeholder={type === 'Remote' ? '/Streaming/Channels/101' : type === 'File' ? '/var/lib/zoneminder/sample.mp4' : 'rtsp://192.168.1.10:554/Streaming/Channels/101'}
                  className={input('path', 'flex-1 font-mono')}
                />
              </Row>
            )}
            {shows('auth') && (
              <Row label={t('Auth')}>
                <input
                  value={form.user ?? ''}
                  onChange={(e) => update('user', e.target.value)}
                  placeholder={t('user')}
                  autoComplete="off"
                  className={input('user', 'flex-1 font-mono')}
                />
                <input
                  type="password"
                  value={form.pass ?? ''}
                  onChange={(e) => update('pass', e.target.value)}
                  placeholder={t('pass')}
                  autoComplete="new-password"
                  className={input('pass', 'flex-1 font-mono')}
                />
              </Row>
            )}
            {shows('refresh') && (
              <Row label={t('Refresh (s)')}>
                <input
                  type="number"
                  min={0}
                  value={form.refresh ?? ''}
                  onChange={(e) => update('refresh', e.target.value === '' ? null : Number(e.target.value))}
                  className={input('refresh', 'w-24 font-mono')}
                />
              </Row>
            )}
          </div>

          {/* Image */}
          <Row label={t('Resolution')} error={fieldErrors.width ?? fieldErrors.height}>
            <input
              type="number"
              min={1}
              value={form.width ?? ''}
              onChange={(e) => update('width', parseInt(e.target.value, 10) || 0)}
              aria-label={t('Width (px)')}
              aria-invalid={!!fieldErrors.width || undefined}
              className={input('width', 'w-24 font-mono')}
            />
            <span className="text-text-muted">×</span>
            <input
              type="number"
              min={1}
              value={form.height ?? ''}
              onChange={(e) => update('height', parseInt(e.target.value, 10) || 0)}
              aria-label={t('Height (px)')}
              aria-invalid={!!fieldErrors.height || undefined}
              className={input('height', 'w-24 font-mono')}
            />
          </Row>

          {error && (
            <div role="alert" className="rounded-md bg-crimson/15 border border-crimson/40 px-3 py-2 text-xs text-crimson">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-subtle">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium rounded border border-border-subtle text-text-muted hover:text-text-primary hover:border-text-secondary/50 transition-colors"
          >
            {t('Cancel')}
          </button>
          <button
            type="submit"
            disabled={create.isPending || !form.name.trim()}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border-2',
              'border-cyan/60 bg-cyan/15 text-cyan',
              'hover:bg-cyan/25 transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {create.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
            {t('Create monitor')}
          </button>
        </footer>
      </form>
    </div>
  );
}

function Row({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted w-20 flex-shrink-0">
          {label}
        </label>
        {children}
      </div>
      {error && <p role="alert" className="text-[10px] text-crimson mt-1 ms-[5.5rem]">{error}</p>}
    </div>
  );
}
