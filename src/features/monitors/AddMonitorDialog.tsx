import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Plus, X, Loader2, Camera } from 'lucide-react';
import { createMonitor, type MonitorCreateInput } from '@/api/monitors-crud';

interface AddMonitorDialogProps {
  open: boolean;
  onClose: () => void;
}

type TypeOption = { value: NonNullable<MonitorCreateInput['type']>; label: string; desc: string };
type FunctionOption = { value: NonNullable<MonitorCreateInput['function']>; label: string };

/** Option labels are built inside a hook so `t()` sees literal keys. */
function useMonitorOptions(): { types: TypeOption[]; functions: FunctionOption[] } {
  const { t } = useTranslation();
  return {
    types: [
      { value: 'Ffmpeg',  label: t('FFmpeg'),  desc: t('Generic RTSP/RTMP/HTTP via libav.') },
      { value: 'Libvlc',  label: t('libVLC'),  desc: t('libVLC backend — handy for awkward streams.') },
      { value: 'Remote',  label: t('Remote'),  desc: t('Direct HTTP MJPEG / JPEG-pull cameras.') },
      { value: 'File',    label: t('File'),    desc: t('Loop a local video file (testing).') },
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

/**
 * Add-monitor wizard. Exposes the essentials operators actually fill in
 * (name, type, host/port/user/pass/path, resolution, function); everything
 * else uses the factory defaults from MONITOR_CREATE_DEFAULTS. The wizard
 * is intentionally minimal — there are 100+ fields on a monitor, and only
 * about ten of them need a value when you're adding a camera for the first
 * time.
 */
export function AddMonitorDialog({ open, onClose }: AddMonitorDialogProps) {
  const { t } = useTranslation();
  const { types, functions } = useMonitorOptions();
  const qc = useQueryClient();
  const [form, setForm] = useState<MonitorCreateInput>({
    name: '',
    type: 'Ffmpeg',
    host: '',
    port: '',
    user: '',
    pass: '',
    path: '',
    width: 1920,
    height: 1080,
    function: 'Modect',
  });
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof MonitorCreateInput>(k: K, v: MonitorCreateInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const create = useMutation({
    mutationFn: () => createMonitor(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monitors'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  if (!open) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError(t('Name is required.'));
      return;
    }
    create.mutate();
  };

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
          {/* Identity */}
          <Row label={t('Name')}>
            <input
              autoFocus
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder={t('Front Door')}
              className="flex-1 px-2 py-1 text-sm bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
            />
          </Row>

          {/* Backend kind */}
          <Row label={t('Type')}>
            <select
              value={form.type}
              onChange={(e) => update('type', e.target.value as MonitorCreateInput['type'])}
              className="flex-1 px-2 py-1 text-sm bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
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
              className="flex-1 px-2 py-1 text-sm bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
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
            <Row label={t('Host')}>
              <input
                value={form.host ?? ''}
                onChange={(e) => update('host', e.target.value)}
                placeholder={t('192.168.1.100 or rtsp://…')}
                className="flex-1 px-2 py-1 text-sm font-mono bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
              />
              <input
                value={form.port ?? ''}
                onChange={(e) => update('port', e.target.value)}
                placeholder={t('port')}
                className="w-20 px-2 py-1 text-sm font-mono bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
              />
            </Row>
            <Row label={t('Path')}>
              <input
                value={form.path ?? ''}
                onChange={(e) => update('path', e.target.value)}
                placeholder="/Streaming/Channels/101 …"
                className="flex-1 px-2 py-1 text-sm font-mono bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
              />
            </Row>
            <Row label={t('Auth')}>
              <input
                value={form.user ?? ''}
                onChange={(e) => update('user', e.target.value)}
                placeholder={t('user')}
                className="flex-1 px-2 py-1 text-sm font-mono bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
              />
              <input
                type="password"
                value={form.pass ?? ''}
                onChange={(e) => update('pass', e.target.value)}
                placeholder={t('pass')}
                className="flex-1 px-2 py-1 text-sm font-mono bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
              />
            </Row>
          </div>

          {/* Image */}
          <Row label={t('Resolution')}>
            <input
              type="number"
              value={form.width ?? ''}
              onChange={(e) => update('width', parseInt(e.target.value, 10) || 0)}
              className="w-24 px-2 py-1 text-sm font-mono bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
            />
            <span className="text-text-muted">×</span>
            <input
              type="number"
              value={form.height ?? ''}
              onChange={(e) => update('height', parseInt(e.target.value, 10) || 0)}
              className="w-24 px-2 py-1 text-sm font-mono bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
            />
          </Row>

          {error && (
            <div className="rounded-md bg-crimson/15 border border-crimson/40 px-3 py-2 text-xs text-crimson">
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted w-20 flex-shrink-0">
        {label}
      </label>
      {children}
    </div>
  );
}
