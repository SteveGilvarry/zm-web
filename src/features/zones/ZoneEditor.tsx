import { useRef, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { Trans, useTranslation } from 'react-i18next';
import { Image as ImageIcon, Plus, RotateCcw, Save, Scan, Square, Trash2, Undo2, X } from 'lucide-react';
import { buttonClasses, fieldClasses } from '@/components/common/styles';
import { zoneCheckMethodLabel } from './zoneSettings';
import {
  CHECK_METHODS, alarmToHex, useZoneEditor,
  type ZoneAreaField, type ZoneEditorState, type ZoneNumField, type ZoneSelection,
} from './useZoneEditor';
import { useObjectSizeTool, type ObjectSizeToolState } from './useObjectSizeTool';
import { useZonePlayer, type ZonePlayer, type ZonePlayerState } from './useZonePlayer';
import { ZoneCanvas } from './ZoneCanvas';
import { ZONE_TYPE_COLORS, ZONE_TYPE_ORDER, zoneTypeHint, zoneTypeLabel } from './zoneTypes';
import { ZoneLiveView } from './ZoneLiveView';
import { AreaPair, FilterSizeInput, PointTable } from './ZoneFormParts';

export type { ZoneSelection } from './useZoneEditor';

interface ZoneEditorProps {
  monitorId: number;
  width: number;
  height: number;
  /**
   * Zone the parent wants open — a list row, or `'new'` for its Add New
   * Zone. Omit to leave the editor uncontrolled.
   */
  openZoneId?: ZoneSelection;
  /** Fires when the selection changes, so the parent can mirror it. */
  onSelectionChange?: (id: ZoneSelection) => void;
  /** The monitor's Default Player, which the Player select's Auto follows. */
  defaultPlayer?: string | null;
  /** The monitor's Orientation; `width`/`height` are already the rotated view. */
  orientation?: string | null;
}

/**
 * The modern zone editor: picture with the polygon on the left, the zone
 * list and the form beside it. State and verbs come from `useZoneEditor`,
 * which the classic skin's legacy-layout page uses too.
 */
export function ZoneEditor({ monitorId, width, height, openZoneId, onSelectionChange, defaultPlayer, orientation }: ZoneEditorProps) {
  const { t } = useTranslation();
  const editor = useZoneEditor({ monitorId, width, height, openZoneId, onSelectionChange });
  const tool = useObjectSizeTool(editor);
  const player = useZonePlayer(defaultPlayer);
  const { zones, draft, selectedId } = editor;

  return (
    <div className="grid grid-cols-[1fr_18rem] gap-4">
      <div className="space-y-2 min-w-0">
        <ZoneCanvas
          monitorWidth={width}
          monitorHeight={height}
          background={
            <ZoneLiveView
              monitorId={monitorId}
              player={player.resolved}
              stillUrl={tool.stillShown ? tool.stillUrl : null}
              frame={editor.frame}
              orientation={orientation}
            />
          }
          otherZones={zones.filter((z) => draft?.id !== z.id)}
          draft={draft}
          onDraftPointsChange={(points) => { if (draft) editor.setDraft({ ...draft, points }); }}
          measure={tool}
        />
        <ZoneStreamControls tool={tool} player={player} hasDraft={!!draft} />
        {draft && tool.showSettings && <ObjectSizeSettings tool={tool} />}
      </div>

      {/* Sidebar — zone list + form */}
      <div className="space-y-3">
        <div className="rounded border border-border-subtle bg-surface overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-subtle">
            <span className="text-label text-fg-dim">{t('Zones')}</span>
            <button onClick={editor.startNewZone} className={buttonClasses('secondary', 'sm')}>
              <Plus size={10} />
              {t('New')}
            </button>
          </div>
          {editor.zonesLoading ? (
            <div className="p-4 text-center text-xs text-fg-dim">{t('Loading…')}</div>
          ) : zones.length === 0 ? (
            <div className="p-4 text-center text-xs text-fg-dim italic">
              <Trans>No zones yet. Click <strong>New</strong> to draw one.</Trans>
            </div>
          ) : (
            <ul>
              {zones.map((z) => {
                const c = ZONE_TYPE_COLORS[z.type] ?? ZONE_TYPE_COLORS.Active;
                return (
                  <li key={z.id}>
                    <button
                      onClick={() => editor.select(z.id)}
                      className={clsx(
                        'w-full flex items-center gap-2 px-3 py-1.5 text-start text-xs border-s-2 transition-colors',
                        selectedId === z.id ? 'bg-accent/10' : 'hover:bg-surface-2',
                      )}
                      style={{ borderInlineStartColor: c.stroke }}
                    >
                      <Square size={10} style={{ color: c.stroke }} fill={c.fill} />
                      <span className="text-fg truncate flex-1">{z.name}</span>
                      <span className="text-xs text-fg-dim">{zoneTypeLabel(z.type, t)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {draft && <ZoneForm editor={editor} tool={tool} />}
      </div>
    </div>
  );
}

/** Measure, still image, undo, and the Player select under the picture. */
function ZoneStreamControls({ tool, player, hasDraft }: {
  tool: ObjectSizeToolState;
  player: ZonePlayerState;
  hasDraft: boolean;
}) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasDraft && (
        <>
          <button
            type="button"
            aria-pressed={tool.armed}
            onClick={tool.toggleArmed}
            title={t('Drag a box around the smallest object that should trigger an alarm, or type its size below')}
            className={buttonClasses(tool.armed ? 'primary' : 'secondary', 'sm')}
          >
            <Scan size={12} />
            {t('Measure object')}
          </button>
          <button
            type="button"
            aria-pressed={tool.stillShown}
            onClick={() => {
              if (!tool.stillUrl) fileRef.current?.click();
              else tool.setStillShown(!tool.stillShown);
            }}
            title={tool.stillShown ? t('Go back to the live view') : t('Measure against a still image instead of the live view')}
            className={buttonClasses(tool.stillShown ? 'primary' : 'secondary', 'sm')}
          >
            <ImageIcon size={12} />
            {tool.stillShown ? t('Live view') : t('Still image')}
          </button>
          {tool.stillShown && (
            <button type="button" onClick={() => fileRef.current?.click()} className={buttonClasses('ghost', 'sm')}>
              {t('Replace this image')}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            data-testid="zone-still-file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) tool.loadStill(file);
            }}
          />
          {tool.canUndo && (
            <button type="button" onClick={tool.undo} className={buttonClasses('ghost', 'sm')} title={t('Undo the last object measurement')}>
              <Undo2 size={12} />
              {t('Undo measurement')}
            </button>
          )}
        </>
      )}
      <label className="ms-auto inline-flex items-center gap-1.5 text-xs text-fg-dim">
        {t('Player')}
        <select
          value={player.player}
          onChange={(e) => player.setPlayer(e.target.value as ZonePlayer)}
          className={fieldClasses('sm')}
        >
          {player.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      {tool.message && (
        <p role="alert" className="basis-full text-xs text-warn">{tool.message}</p>
      )}
    </div>
  );
}

/** Legacy's "Rectangle measurement" table (`zone.php:339-372`). */
function ObjectSizeSettings({ tool }: { tool: ObjectSizeToolState }) {
  const { t } = useTranslation();
  const ratio = (key: 'fraction' | 'filter' | 'blob', label: string, hint: string) => (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-28 text-fg-dim">{label}</span>
      <input
        type="number"
        min={1}
        max={100}
        step={1}
        defaultValue={tool.ratios[key]}
        key={`${key}-${tool.ratios[key]}`}
        aria-label={label}
        onBlur={(e) => tool.setRatio(key, e.target.value)}
        className={clsx('w-16', fieldClasses('sm'))}
      />
      %
      <span className="text-fg-faint">{hint}</span>
    </label>
  );
  return (
    <section className="rounded border border-border-subtle bg-surface p-3 space-y-2" aria-label={t('Rectangle measurement')}>
      <span className="text-label text-fg-dim">{t('Rectangle measurement')}</span>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="w-28 text-fg-dim">{t('Object size')}</span>
        <input
          type="number" min={1} step={1}
          value={tool.typedWidth}
          onChange={(e) => tool.setTypedWidth(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); tool.applyTypedSize(); } }}
          aria-label={t('Object width in pixels')}
          className={clsx('w-20', fieldClasses('sm'))}
        />
        ×
        <input
          type="number" min={1} step={1}
          value={tool.typedHeight}
          onChange={(e) => tool.setTypedHeight(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); tool.applyTypedSize(); } }}
          aria-label={t('Object height in pixels')}
          className={clsx('w-20', fieldClasses('sm'))}
        />
        {t('px')}
        <button type="button" onClick={tool.applyTypedSize} className={buttonClasses('secondary', 'sm')} title={t('Derive the detection settings from this object size')}>
          {t('Apply')}
        </button>
        <span className="text-fg-faint">{t('in capture pixels, if you would rather not draw')}</span>
      </div>
      {ratio('fraction', t('Alarmed area'), t('of the drawn rectangle'))}
      {ratio('filter', t('Filtered area'), t('of alarmed area'))}
      {ratio('blob', t('Blob area'), t('of filtered area'))}
    </section>
  );
}

function ZoneForm({ editor, tool }: { editor: ZoneEditorState; tool: ObjectSizeToolState }) {
  const { t } = useTranslation();
  const draft = editor.draft!;
  const enabled = editor.enabled!;
  const detects = draft.type !== 'Inactive' && draft.type !== 'Privacy';

  return (
    <div className="rounded border border-border bg-surface p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-label text-fg">
          {draft.id == null ? t('New zone') : t('Editing #{{id}}', { id: draft.id })}
        </span>
        <button
          onClick={editor.cancel}
          aria-label={t('Cancel edit')}
          className="p-1 rounded text-fg-dim hover:text-fg hover:bg-surface-2 transition-colors"
        >
          <X size={11} />
        </button>
      </div>

      <Field label={t('Name')}>
        <input
          aria-label={t('Name')}
          value={draft.name}
          onChange={(e) => editor.setDraft({ ...draft, name: e.target.value })}
          className={clsx('flex-1', fieldClasses('sm'))}
        />
      </Field>
      <Field label={t('Type')}>
        <select
          aria-label={t('Type')}
          value={draft.type}
          onChange={(e) => editor.setDraft({ ...draft, type: e.target.value })}
          className={clsx('flex-1', fieldClasses('sm'))}
        >
          {ZONE_TYPE_ORDER.map((type) => (
            <option key={type} value={type}>{zoneTypeLabel(type, t)}</option>
          ))}
        </select>
      </Field>
      <div className="text-xs text-fg-dim italic px-1">{zoneTypeHint(draft.type, t)}</div>
      {editor.presets.length > 0 && (
        <Field label={t('Preset')}>
          <select
            aria-label={t('Preset')}
            value=""
            disabled={!detects}
            onChange={(e) => { if (e.target.value) editor.applyPreset(Number(e.target.value)); }}
            className={clsx('flex-1', fieldClasses('sm'), 'disabled:opacity-40')}
          >
            <option value="">{t('Choose Preset')}</option>
            {editor.presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      )}

      <div className="text-xs font-mono text-fg-dim" data-testid="zone-area-readout">
        {t('Zone Area {{pct}}% · {{px}} px', {
          pct: editor.zonePct.toFixed(2),
          px: editor.zonePx.toLocaleString(),
        })}
      </div>
      <div className="text-xs text-fg-dim">
        {t('{{count}} vertex · click an edge dot to insert · Alt-click a vertex to remove', { count: draft.points.length })}
      </div>

      <div className="space-y-2 pt-1 border-t border-border-subtle">
        <span className="text-label text-fg-dim">{t('Motion settings')}</span>

        <SettingRow label={t('Alarm Colour')}>
          <input
            type="color"
            value={alarmToHex(draft.alarm)}
            disabled={!enabled.alarm_rgb}
            onChange={(e) => editor.setAlarmHex(e.target.value)}
            aria-label={t('Alarm Colour')}
            className="h-6 w-10 rounded border border-border-subtle bg-surface disabled:opacity-40"
          />
          {(['r', 'g', 'b'] as const).map((ch) => (
            <input
              key={ch}
              type="number"
              min={0}
              max={255}
              value={draft.alarm[ch]}
              disabled={!enabled.alarm_rgb}
              onChange={(e) => editor.setAlarmChannel(ch, e.target.value)}
              aria-label={ch === 'r' ? t('Red') : ch === 'g' ? t('Green') : t('Blue')}
              className={clsx('w-full min-w-0 tabular-nums', fieldClasses('sm'), 'disabled:opacity-40')}
            />
          ))}
        </SettingRow>

        <SettingRow label={t('Check Method')}>
          <select
            value={draft.checkMethod}
            disabled={!enabled.check_method}
            onChange={(e) => editor.setDraft({ ...draft, checkMethod: e.target.value })}
            aria-label={t('Check Method')}
            className={clsx('w-full', fieldClasses('sm'), 'disabled:opacity-40', tool.changed.has('check_method') && 'ring-1 ring-ok')}
          >
            {CHECK_METHODS.map((m) => <option key={m} value={m}>{zoneCheckMethodLabel(m, t)}</option>)}
          </select>
        </SettingRow>

        <NumPair label={t('Min/Max Pixel Threshold')} min={0} max={255}
          fields={['min_pixel_threshold', 'max_pixel_threshold']} editor={editor} tool={tool} />

        <SettingRow label={t('Filter Width/Height')}>
          {(['filter_x', 'filter_y'] as const).map((f, i) => (
            <FilterSizeInput
              key={f}
              editor={editor}
              field={f}
              label={i === 0 ? t('Filter width') : t('Filter height')}
              changed={tool.changed.has(f)}
              className={clsx('w-full min-w-0 tabular-nums', fieldClasses('sm'), 'disabled:opacity-40')}
            />
          ))}
        </SettingRow>

        <AreaRow label={t('Min/Max Alarmed Area')} fields={['min_alarm_pixels', 'max_alarm_pixels']} editor={editor} tool={tool} />
        <AreaRow label={t('Min/Max Filtered Area')} fields={['min_filter_pixels', 'max_filter_pixels']} editor={editor} tool={tool} />
        <AreaRow label={t('Min/Max Blob Area')} fields={['min_blob_pixels', 'max_blob_pixels']} editor={editor} tool={tool} />

        <NumPair label={t('Min/Max Blobs')} min={0} fields={['min_blobs', 'max_blobs']} editor={editor} tool={tool} />
        <NumPair label={t('Overload Frame Ignore Count')} min={0} fields={['overload_frames']} editor={editor} tool={tool} />
        <NumPair label={t('Extend Alarm Frame Count')} min={0} fields={['extend_alarm_frames']} editor={editor} tool={tool} />
      </div>

      <PointTable
        points={draft.points}
        maxX={editor.frame.width}
        maxY={editor.frame.height}
        onChange={(points) => editor.setDraft({ ...draft, points })}
        inputClassName={fieldClasses('sm')}
      />

      {editor.selfIntersecting && (
        <p role="alert" className="text-xs text-danger">{t('Polygon edges must not intersect')}</p>
      )}
      {editor.errors.length > 0 && (
        <ul role="alert" aria-label={t('Cannot save the zone')} className="text-xs text-danger list-disc ps-4 space-y-0.5">
          {editor.errors.filter((e) => !editor.selfIntersecting || e !== t('Polygon edges must not intersect'))
            .map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        {draft.id != null && (
          <button
            type="button"
            onClick={editor.remove}
            disabled={editor.removing}
            className={clsx(buttonClasses('secondary', 'sm'), 'text-danger hover:text-danger hover:border-danger/50 me-auto')}
          >
            <Trash2 size={10} />
            {t('Delete')}
          </button>
        )}
        <button
          type="button"
          onClick={editor.reset}
          disabled={!editor.dirty}
          className={buttonClasses('secondary', 'sm')}
        >
          <RotateCcw size={10} />
          {t('Reset')}
        </button>
        <button
          type="button"
          onClick={editor.save}
          disabled={editor.saving || draft.points.length < 3 || !draft.name.trim() || editor.selfIntersecting}
          className={buttonClasses('primary', 'sm')}
        >
          <Save size={10} />
          {t('Save')}
        </button>
      </div>
    </div>
  );
}

/** A min/max area row: two mirrored % + px pairs. */
function AreaRow({ label, fields, editor, tool }: {
  label: string;
  fields: readonly [ZoneAreaField, ZoneAreaField];
  editor: ZoneEditorState;
  tool: ObjectSizeToolState;
}) {
  const { t } = useTranslation();
  return (
    <SettingRow label={label}>
      <div className="flex flex-col gap-1 w-full">
        {fields.map((f, i) => (
          <AreaPair
            key={f}
            editor={editor}
            field={f}
            label={t('{{label}} ({{which}})', { label, which: i === 0 ? t('min') : t('max') })}
            changed={tool.changed.has(f)}
            inputClassName={clsx('w-20 tabular-nums', fieldClasses('sm'), 'disabled:opacity-40')}
            suffixClassName="text-xs text-fg-dim"
          />
        ))}
      </div>
    </SettingRow>
  );
}

/** One settings row: its label and the one or two numbers legacy puts on it. */
function NumPair({ label, fields, editor, tool, min, max }: {
  label: string;
  fields: readonly ZoneNumField[];
  editor: ZoneEditorState;
  tool: ObjectSizeToolState;
  min?: number;
  max?: number;
}) {
  const { t } = useTranslation();
  const draft = editor.draft!;
  const enabled = editor.enabled!;
  // "Min/Max Blobs" → "Min/Max Blobs (min)" / "(max)" for the two boxes' labels.
  const boxLabel = (i: number) =>
    fields.length === 1 ? label : t('{{label}} ({{which}})', { label, which: i === 0 ? t('min') : t('max') });

  return (
    <SettingRow label={label}>
      {fields.map((field, i) => (
        <input
          key={field}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          value={draft.nums[field]}
          disabled={!enabled[field]}
          aria-label={boxLabel(i)}
          onChange={(e) => editor.setNum(field, e.target.value)}
          className={clsx('w-full min-w-0 tabular-nums', fieldClasses('sm'), 'disabled:opacity-40', tool.changed.has(field) && 'ring-1 ring-ok')}
        />
      ))}
    </SettingRow>
  );
}

/**
 * A settings row: the label above its controls. Legacy lays these out as a
 * three-column table, which does not fit an 18rem sidebar — "Overload Frame
 * Ignore Count" alone is wider than the label column would be.
 */
function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <span className="text-label text-fg-dim block">{label}</span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-label text-fg-dim w-14 flex-shrink-0">{label}</label>
      {children}
    </div>
  );
}
