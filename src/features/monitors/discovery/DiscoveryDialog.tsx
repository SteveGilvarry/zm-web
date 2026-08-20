import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Radar, X, Loader2, ChevronLeft, Search, Plus } from 'lucide-react';
import type { InspectProfile } from '@/api/discovery';
import type { MonitorCreateInput } from '@/api/monitors-crud';
import type { Monitor } from '@/types';
import { AddMonitorDialog } from '../AddMonitorDialog';
import { useDiscovery } from './useDiscovery';
import { prefillFromProfile } from './streamUri';

export interface DiscoveryDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called with the monitor created from a discovered profile. */
  onCreated?: (monitor: Monitor) => void;
}

/** Probe durations offered, in ms. WS-Discovery answers arrive within a second or two on a LAN. */
const TIMEOUTS = [2000, 5000, 10000];

/**
 * The legacy "SCAN NETWORK" / `?view=onvifprobe` wizard: probe the LAN for
 * ONVIF cameras (or type a device-service URL), inspect one with
 * credentials, pick a media profile, and hand the resolved stream to the
 * Add dialog prefilled. The backend has no one-shot onboard endpoint, so
 * the last step is the normal create.
 */
export function DiscoveryDialog({ open, onClose, onCreated }: DiscoveryDialogProps) {
  if (!open) return null;
  return <DiscoveryWizard onClose={onClose} onCreated={onCreated} />;
}

export default DiscoveryDialog;

function DiscoveryWizard({ onClose, onCreated }: Omit<DiscoveryDialogProps, 'open'>) {
  const { t } = useTranslation();
  const d = useDiscovery();
  const [timeoutMs, setTimeoutMs] = useState(TIMEOUTS[1]);
  const [prefill, setPrefill] = useState<Partial<MonitorCreateInput> | null>(null);

  const input = 'px-2 py-1 text-sm bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50';
  const button = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const primary = clsx(button, 'border-cyan/60 bg-cyan/15 text-cyan hover:bg-cyan/25');
  const secondary = clsx(button, 'border-border-subtle text-text-muted hover:text-text-primary hover:border-text-secondary/50');

  const startCreate = (profile: InspectProfile) => {
    if (!d.result) return;
    setPrefill(prefillFromProfile(d.result, profile, { username: d.username, password: d.password }, d.selected?.name));
  };

  const submitInspect = (e: FormEvent) => {
    e.preventDefault();
    d.inspect();
  };

  if (prefill) {
    return (
      <AddMonitorDialog
        open
        initial={prefill}
        onClose={() => setPrefill(null)}
        onCreated={(m) => { onCreated?.(m); onClose(); }}
      />
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('Scan network for cameras')}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-xl border border-cyan/40 bg-panel/95 backdrop-blur-md shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
        <header className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Radar size={16} className="text-cyan" />
            <h2 className="text-sm font-semibold text-text-primary">{t('Scan network for cameras')}</h2>
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted ms-2">
              {d.step === 'scan' ? t('Step 1 of 3 — find') : d.step === 'inspect' ? t('Step 2 of 3 — sign in') : t('Step 3 of 3 — choose a stream')}
            </span>
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

        <div className="p-5 space-y-4 overflow-y-auto">
          {d.step === 'scan' && (
            <>
              <p className="text-xs text-text-muted">
                {t('Sends a WS-Discovery probe on the server’s network and lists the ONVIF cameras that answer. Nothing is changed.')}
              </p>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">{t('Wait')}</label>
                <select
                  value={timeoutMs}
                  onChange={(e) => setTimeoutMs(Number(e.target.value))}
                  className={input}
                >
                  {TIMEOUTS.map((ms) => (
                    <option key={ms} value={ms}>{t('{{count}} second', { count: ms / 1000 })}</option>
                  ))}
                </select>
                <button type="button" onClick={() => d.scan(timeoutMs)} disabled={d.isScanning} className={primary}>
                  {d.isScanning ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                  {d.isScanning ? t('Scanning…') : t('Scan')}
                </button>
              </div>

              {d.candidates.length > 0 ? (
                <div className="overflow-x-auto rounded border border-border-subtle">
                  <table className="w-full text-xs">
                    <thead className="bg-surface/60 text-[10px] font-mono uppercase tracking-wider text-text-muted">
                      <tr>
                        <th className="text-start px-3 py-2">{t('Name')}</th>
                        <th className="text-start px-3 py-2">{t('Hardware')}</th>
                        <th className="text-start px-3 py-2">{t('Location')}</th>
                        <th className="text-start px-3 py-2">{t('Address')}</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {d.candidates.map((c) => (
                        <tr key={c.endpoint_reference || c.xaddrs[0]} className="border-t border-border-subtle/60">
                          <td className="px-3 py-2 text-text-primary">{c.name ?? '—'}</td>
                          <td className="px-3 py-2 text-text-secondary">{c.hardware ?? '—'}</td>
                          <td className="px-3 py-2 text-text-secondary">{c.location ?? '—'}</td>
                          <td className="px-3 py-2 font-mono text-text-muted" dir="ltr">{c.xaddrs[0] ?? '—'}</td>
                          <td className="px-3 py-2 text-end">
                            <button type="button" onClick={() => d.pick(c)} disabled={!c.xaddrs[0]} className={secondary}>
                              {t('Inspect')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : d.scanError ? (
                <p className="text-xs text-crimson">{t('The scan failed. Check that the API server can reach the camera network.')}</p>
              ) : !d.isScanning ? (
                <p className="text-xs text-text-muted">{t('No cameras listed yet. Scan, or type a device-service URL below.')}</p>
              ) : null}

              <div className="pt-2 border-t border-border-subtle/60">
                <label className="block text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted mb-1">
                  {t('Or enter an ONVIF device-service URL')}
                </label>
                <input
                  value={d.xaddr}
                  onChange={(e) => d.setXaddr(e.target.value)}
                  placeholder="http://192.168.1.50/onvif/device_service"
                  dir="ltr"
                  className={clsx(input, 'w-full font-mono')}
                />
              </div>
            </>
          )}

          {d.step === 'inspect' && (
            <form onSubmit={submitInspect} className="space-y-3">
              <p className="text-xs text-text-muted">
                {t('Sign in to read the camera’s identity and media profiles. Leave the username blank to query it anonymously.')}
              </p>
              <div>
                <label htmlFor="discovery-xaddr" className="block text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted mb-1">{t('Device-service URL')}</label>
                <input
                  id="discovery-xaddr"
                  value={d.xaddr}
                  onChange={(e) => d.setXaddr(e.target.value)}
                  dir="ltr"
                  className={clsx(input, 'w-full font-mono')}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="discovery-username" className="block text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted mb-1">{t('Username')}</label>
                  <input
                    id="discovery-username"
                    value={d.username}
                    onChange={(e) => d.setUsername(e.target.value)}
                    autoComplete="off"
                    className={clsx(input, 'w-full font-mono')}
                  />
                </div>
                <div>
                  <label htmlFor="discovery-password" className="block text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted mb-1">{t('Password')}</label>
                  <input
                    id="discovery-password"
                    type="password"
                    value={d.password}
                    onChange={(e) => d.setPassword(e.target.value)}
                    autoComplete="new-password"
                    className={clsx(input, 'w-full font-mono')}
                  />
                </div>
              </div>
              {d.inspectError ? (
                <p role="alert" className="text-xs text-crimson">
                  {t('The camera did not answer. Check the URL and credentials.')}
                </p>
              ) : null}
              <div className="flex items-center justify-between pt-2">
                <button type="button" onClick={d.back} className={secondary}>
                  <ChevronLeft size={12} className="rtl:-scale-x-100" />
                  {t('Back')}
                </button>
                <button type="submit" disabled={!d.xaddr.trim() || d.isInspecting} className={primary}>
                  {d.isInspecting ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                  {d.isInspecting ? t('Inspecting…') : t('Inspect')}
                </button>
              </div>
            </form>
          )}

          {d.step === 'profiles' && d.result && (
            <>
              <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-xs">
                <Fact label={t('Manufacturer')} value={d.result.manufacturer} />
                <Fact label={t('Model')} value={d.result.model} />
                <Fact label={t('Firmware')} value={d.result.firmware_version} />
                <Fact label={t('Serial')} value={d.result.serial_number} />
                <Fact label={t('PTZ')} value={d.result.ptz_service ? t('Yes') : t('No')} />
                <Fact label={t('Events')} value={d.result.events_service ? t('Yes') : t('No')} />
              </dl>

              {d.result.profiles.length === 0 ? (
                <p className="text-xs text-text-muted">{t('The camera reported no media profiles.')}</p>
              ) : (
                <div className="overflow-x-auto rounded border border-border-subtle">
                  <table className="w-full text-xs">
                    <thead className="bg-surface/60 text-[10px] font-mono uppercase tracking-wider text-text-muted">
                      <tr>
                        <th className="text-start px-3 py-2">{t('Profile')}</th>
                        <th className="text-start px-3 py-2">{t('Encoding')}</th>
                        <th className="text-start px-3 py-2">{t('Resolution')}</th>
                        <th className="text-start px-3 py-2">{t('Stream URI')}</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {d.result.profiles.map((p) => (
                        <tr key={p.token} className="border-t border-border-subtle/60">
                          <td className="px-3 py-2 text-text-primary">
                            {p.name ?? p.token}
                            <span className="block font-mono text-[10px] text-text-muted">{p.token}</span>
                          </td>
                          <td className="px-3 py-2 text-text-secondary">{p.encoding ?? '—'}</td>
                          <td className="px-3 py-2 font-mono tabular-nums text-text-secondary">
                            {p.width && p.height ? `${p.width}×${p.height}` : '—'}
                          </td>
                          <td className="px-3 py-2 font-mono text-text-muted break-all" dir="ltr">{p.stream_uri ?? t('(not provided)')}</td>
                          <td className="px-3 py-2 text-end">
                            <button type="button" onClick={() => startCreate(p)} className={primary}>
                              <Plus size={12} />
                              {t('Create monitor')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button type="button" onClick={d.back} className={secondary}>
                  <ChevronLeft size={12} className="rtl:-scale-x-100" />
                  {t('Back')}
                </button>
                <button type="button" onClick={onClose} className={secondary}>{t('Close')}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">{label}</dt>
      <dd className="text-text-primary">{value || '—'}</dd>
    </div>
  );
}
