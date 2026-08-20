import { useEffect, useRef, useState, type ButtonHTMLAttributes, type PointerEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import {
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
  ArrowUpLeft, ArrowUpRight, ArrowDownLeft, ArrowDownRight,
  ChevronLeft, ChevronRight,
  Home, Plus, Minus, Focus as FocusIcon, Save, Trash2, AlertTriangle,
} from 'lucide-react';
import { ptz, type PtzCapabilities, type PtzDirection } from '@/api/ptz';

interface PtzControlsProps {
  monitorId: number;
  capabilities: PtzCapabilities;
}

/** How long a failed command stays on screen before clearing itself. */
const ERROR_TTL_MS = 6_000;

/**
 * PTZ control surface — instrument-console aesthetic: tactile depressing
 * buttons, cyan glow on press, inset shadows, mono-font readouts. Press-and-
 * hold via PointerEvents with pointer capture so releasing outside the
 * button still stops the camera.
 *
 * Capabilities-gated: only renders the sub-clusters the backend advertises
 * for this monitor (e.g. no zoom cluster if `caps.zoom.can` is false; no
 * preset bank if `caps.presets.has_presets` is false). The detail page
 * decides whether to mount this at all based on whether capabilities resolved.
 *
 * Every command failure (camera unreachable, control script error, 403) is
 * shown inline under the pad for a few seconds — silently dropping a PTZ
 * command looks exactly like a dead camera.
 *
 * The d-pad and the zoom/focus rockers are physical controls — "left" means
 * the camera pans left — so they sit in `dir="ltr"` and never mirror.
 */
export function PtzControls({ monitorId, capabilities: caps }: PtzControlsProps) {
  const { t } = useTranslation();
  const [speed, setSpeed] = useState(50);
  const [presetSlot, setPresetSlot] = useState(1);
  const [presetName, setPresetName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (errorTimer.current) clearTimeout(errorTimer.current); }, []);

  /** Run a PTZ command; surface the failure inline. */
  const run = (label: string, command: Promise<unknown>) => {
    command.catch((err: unknown) => {
      const detail = err instanceof Error && err.message ? err.message : t('command failed');
      setError(t('{{command}}: {{detail}}', { command: label, detail }));
      if (errorTimer.current) clearTimeout(errorTimer.current);
      errorTimer.current = setTimeout(() => {
        errorTimer.current = null;
        setError(null);
      }, ERROR_TTL_MS);
    });
  };

  const pt = caps.pan_tilt;
  const presetSlots = Math.min(caps.presets.num_presets ?? 0, 16);

  // Continuous (press-and-hold) when the camera supports it, otherwise a
  // 300 ms timed step on each press.
  const holdMove = (dir: PtzDirection) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      run(t('Move'), ptz.move(monitorId, dir,
        pt.can_move_con
          ? { pan_speed: speed, tilt_speed: speed }
          : { pan_speed: speed, tilt_speed: speed, duration_ms: 300 },
      ));
    },
    onPointerUp: () => { if (pt.can_move_con) run(t('Stop'), ptz.stopMove(monitorId)); },
    onPointerCancel: () => { if (pt.can_move_con) run(t('Stop'), ptz.stopMove(monitorId)); },
  });

  const holdZoom = (dir: 'in' | 'out') => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      run(t('Zoom'), ptz.zoom(monitorId, dir,
        caps.zoom.can_con ? { speed } : { speed, duration_ms: 300 },
      ));
    },
    onPointerUp: () => { if (caps.zoom.can_con) run(t('Stop'), ptz.stopZoom(monitorId)); },
    onPointerCancel: () => { if (caps.zoom.can_con) run(t('Stop'), ptz.stopZoom(monitorId)); },
  });

  const holdFocus = (dir: 'near' | 'far') => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      run(t('Focus'), ptz.focus(monitorId, dir,
        caps.focus.can_con ? { speed } : { speed, duration_ms: 300 },
      ));
    },
    onPointerUp: () => { if (caps.focus.can_con) run(t('Stop'), ptz.stopFocus(monitorId)); },
    onPointerCancel: () => { if (caps.focus.can_con) run(t('Stop'), ptz.stopFocus(monitorId)); },
  });

  return (
    <div className="space-y-5">
      {/* D-pad cluster — the focal element of the panel. */}
      {pt.can_move && (
        <div className="flex justify-center" dir="ltr">
          <div className="grid grid-cols-3 gap-1.5" style={{ width: 196 }}>
            <DpadBtn aria-label={t('Move up-left')}    disabled={!pt.can_move_diag} {...holdMove('up-left')}>
              <ArrowUpLeft size={18} strokeWidth={2.4} />
            </DpadBtn>
            <DpadBtn aria-label={t('Move up')}         disabled={!pt.can_tilt}      {...holdMove('up')}>
              <ArrowUp size={20} strokeWidth={2.4} />
            </DpadBtn>
            <DpadBtn aria-label={t('Move up-right')}   disabled={!pt.can_move_diag} {...holdMove('up-right')}>
              <ArrowUpRight size={18} strokeWidth={2.4} />
            </DpadBtn>
            <DpadBtn aria-label={t('Move left')}       disabled={!pt.can_pan}       {...holdMove('left')}>
              <ArrowLeft size={20} strokeWidth={2.4} />
            </DpadBtn>
            <DpadBtn aria-label={t('Home')}            center
              onClick={() => run(t('Home'), ptz.home(monitorId))}
              title={t('Return to home position')}
            >
              <Home size={18} strokeWidth={2.4} />
            </DpadBtn>
            <DpadBtn aria-label={t('Move right')}      disabled={!pt.can_pan}       {...holdMove('right')}>
              <ArrowRight size={20} strokeWidth={2.4} />
            </DpadBtn>
            <DpadBtn aria-label={t('Move down-left')}  disabled={!pt.can_move_diag} {...holdMove('down-left')}>
              <ArrowDownLeft size={18} strokeWidth={2.4} />
            </DpadBtn>
            <DpadBtn aria-label={t('Move down')}       disabled={!pt.can_tilt}      {...holdMove('down')}>
              <ArrowDown size={20} strokeWidth={2.4} />
            </DpadBtn>
            <DpadBtn aria-label={t('Move down-right')} disabled={!pt.can_move_diag} {...holdMove('down-right')}>
              <ArrowDownRight size={18} strokeWidth={2.4} />
            </DpadBtn>
          </div>
        </div>
      )}

      {/* Last command failure */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-crimson/40 bg-crimson/10 text-crimson text-xs"
        >
          <AlertTriangle size={12} className="flex-shrink-0" />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* Speed */}
      <Section
        label={t('Speed')}
        action={
          <span className="text-sm font-mono tabular-nums text-cyan">
            {speed}<span className="text-text-muted text-[10px] ms-0.5">%</span>
          </span>
        }
      >
        <div className="space-y-1">
          <input
            type="range" min={1} max={100} value={speed}
            onChange={(e) => setSpeed(parseInt(e.target.value, 10))}
            className="w-full accent-cyan"
            aria-label={t('Movement speed')}
          />
          <div className="flex justify-between text-[9px] font-mono text-text-dim select-none px-0.5">
            <Tick value={1}  highlight={speed <= 12} />
            <Tick value={25} highlight={Math.abs(speed - 25) <= 12} />
            <Tick value={50} highlight={Math.abs(speed - 50) <= 12} />
            <Tick value={75} highlight={Math.abs(speed - 75) <= 12} />
            <Tick value={100} highlight={speed >= 88} />
          </div>
        </div>
      </Section>

      {/* Zoom */}
      {caps.zoom.can && (
        <Section label={t('Zoom')}>
          <div className="grid grid-cols-2 gap-2" dir="ltr">
            <RockerBtn {...holdZoom('out')}>
              <Minus size={14} strokeWidth={2.5} />
              <span>{t('Wider')}</span>
            </RockerBtn>
            <RockerBtn {...holdZoom('in')}>
              <Plus size={14} strokeWidth={2.5} />
              <span>{t('Closer')}</span>
            </RockerBtn>
          </div>
        </Section>
      )}

      {/* Focus */}
      {caps.focus.can && (
        <Section label={t('Focus')}>
          <div className="grid grid-cols-3 gap-2" dir="ltr">
            <RockerBtn {...holdFocus('near')}>
              <ChevronLeft size={14} strokeWidth={2.5} />
              <span>{t('Near')}</span>
            </RockerBtn>
            <RockerBtn
              variant="state"
              disabled={!caps.focus.can_auto}
              onClick={() => run(t('Auto focus'), ptz.focus(monitorId, 'auto'))}
            >
              <FocusIcon size={14} strokeWidth={2.5} />
              <span>{t('Auto')}</span>
            </RockerBtn>
            <RockerBtn {...holdFocus('far')}>
              <span>{t('Far')}</span>
              <ChevronRight size={14} strokeWidth={2.5} />
            </RockerBtn>
          </div>
        </Section>
      )}

      {/* Presets */}
      {caps.presets.has_presets && presetSlots > 0 && (
        <Section
          label={t('Presets')}
          action={
            <span className="text-[10px] font-mono text-text-muted tabular-nums">
              {t('{{count}} slot', { count: presetSlots })}
            </span>
          }
        >
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: presetSlots }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => run(t('Preset {{n}}', { n }), ptz.gotoPreset(monitorId, n))}
                className="w-9 h-9 rounded-md border-2 border-border bg-surface text-cyan font-mono tabular-nums text-xs select-none transition-all hover:border-cyan/50 hover:bg-cyan/10 hover:shadow-[0_0_8px_rgba(0,212,255,0.15)] active:scale-95"
                title={t('Go to preset {{n}}', { n })}
              >
                {n}
              </button>
            ))}
          </div>

          {caps.presets.can_set_presets && (
            <div className="mt-3 flex items-center gap-1.5">
              <select
                value={presetSlot}
                onChange={(e) => setPresetSlot(parseInt(e.target.value, 10))}
                className="px-2 py-1.5 text-xs font-mono tabular-nums rounded-md border-2 border-border bg-surface text-text-primary"
                aria-label={t('Preset slot')}
              >
                {Array.from({ length: presetSlots }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>#{n}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder={t('Name (optional)')}
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                className="flex-1 min-w-0 px-2 py-1.5 text-xs rounded-md border-2 border-border bg-surface text-text-primary placeholder:text-text-dim focus:outline-none focus:border-cyan/50"
              />
              <button
                type="button"
                onClick={() => {
                  run(t('Save preset'), ptz.setPreset(monitorId, presetSlot, presetName || undefined));
                  setPresetName('');
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium uppercase tracking-wider rounded-md border-2 border-cyan/40 bg-cyan/15 text-cyan hover:bg-cyan/25 hover:border-cyan/60 active:scale-95 transition-all"
                title={t('Save current position to selected slot')}
              >
                <Save size={12} strokeWidth={2.5} />
                {t('Save')}
              </button>
              <button
                type="button"
                onClick={() => run(t('Clear preset'), ptz.clearPreset(monitorId, presetSlot))}
                className="flex items-center px-2.5 py-1.5 text-xs rounded-md border-2 border-border text-text-muted hover:border-crimson/60 hover:text-crimson hover:bg-crimson/5 active:scale-95 transition-all"
                title={t('Clear preset in selected slot')}
              >
                <Trash2 size={12} strokeWidth={2.5} />
              </button>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

function Section({ label, children, action }: {
  label: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
          {label}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}

function Tick({ value, highlight }: { value: number; highlight: boolean }) {
  return (
    <span className={clsx(highlight ? 'text-cyan' : 'text-text-dim')}>
      {value}
    </span>
  );
}

interface DpadBtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  center?: boolean;
  children: ReactNode;
}

function DpadBtn({ children, center, disabled, className, ...rest }: DpadBtnProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={clsx(
        'aspect-square flex items-center justify-center rounded-md border-2 select-none touch-none transition-all duration-100',
        disabled
          ? 'border-border-subtle/30 text-text-dim/50 cursor-not-allowed bg-surface/30'
          : center
            ? 'border-cyan/50 bg-cyan/15 text-cyan shadow-[inset_0_0_12px_rgba(0,212,255,0.18)] hover:bg-cyan/25 hover:border-cyan/70 hover:shadow-[inset_0_0_16px_rgba(0,212,255,0.3),0_0_10px_rgba(0,212,255,0.25)] active:scale-90 active:shadow-[inset_0_0_24px_rgba(0,212,255,0.5)]'
            : 'border-border bg-surface text-text-secondary hover:border-cyan/40 hover:text-cyan hover:bg-cyan/5 active:scale-90 active:bg-cyan/20 active:border-cyan/60 active:text-cyan active:shadow-[inset_0_0_14px_rgba(0,212,255,0.4)]',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

interface RockerBtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 'state' = single-shot like Auto (no press-and-hold semantics). */
  variant?: 'default' | 'state';
  children: ReactNode;
}

function RockerBtn({ children, variant = 'default', disabled, className, ...rest }: RockerBtnProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={clsx(
        'flex items-center justify-center gap-1.5 py-2.5 rounded-md border-2 text-xs font-medium uppercase tracking-wider select-none touch-none transition-all duration-100',
        disabled
          ? 'border-border-subtle/30 text-text-dim/50 cursor-not-allowed bg-surface/30'
          : variant === 'state'
            ? 'border-amber/40 bg-amber/10 text-amber hover:bg-amber/20 hover:border-amber/60 active:scale-[0.97] active:shadow-[inset_0_0_12px_rgba(255,176,0,0.3)]'
            : 'border-border bg-surface text-text-secondary hover:border-cyan/40 hover:text-cyan hover:bg-cyan/5 active:scale-[0.97] active:bg-cyan/15 active:border-cyan/60 active:text-cyan active:shadow-[inset_0_0_12px_rgba(0,212,255,0.35)]',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
