import { useRef } from 'react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle, Image as ImageIcon, PlusCircle, RotateCcw, Save, Scan, Trash2, Undo2, X,
} from 'lucide-react';
import { AppShell } from '@/skins/AppShell';
import { QueryState } from '@/components/common/QueryState';
import type { PagePropsMap } from '@/skins/types';
import type { Monitor } from '@/types';
import { RequirePerm } from '@/features/auth/RequirePerm';
import { usePerms } from '@/features/auth/usePerms';
import { useCanGoBack } from '@/features/nav/useCanGoBack';
import { formatFpsLegacy, type MonitorRuntime } from '@/features/monitors/useMonitorStatuses';
import { useZonesListPage } from '@/features/zones/useZonesListPage';
import { CHECK_METHODS, alarmToHex, useZoneEditor, type ZoneAreaField, type ZoneNumField } from '@/features/zones/useZoneEditor';
import { useObjectSizeTool, type ObjectSizeToolState } from '@/features/zones/useObjectSizeTool';
import { useZonePlayer, type ZonePlayer } from '@/features/zones/useZonePlayer';
import { ZoneCanvas } from '@/features/zones/ZoneCanvas';
import { ZoneLiveView } from '@/features/zones/ZoneLiveView';
import { ZonesPicture } from '@/features/zones/ZonesPicture';
import { AreaPair, FilterSizeInput, PointTable } from '@/features/zones/ZoneFormParts';
import { ZONE_TYPE_ORDER, zoneTypeLabel } from '@/features/zones/zoneTypes';
import { zoneArea, zoneAreaMismatch, zoneOutOfBounds } from '@/features/zones/zoneArea';
import { useDocumentTitle } from '@/skins/modern/layouts/useDocumentTitle';
import type { ButtonHTMLAttributes } from 'react';
import {
  ClassicButton, ClassicHeader, ClassicPage, ClassicSelect, ClassicTable, ClassicTd, ClassicTh, ClassicThead,
  classicButtonClass, classicInputClass,
} from '@/skins/classic/components';

/**
 * Legacy's square icon buttons (`btn btn-normal`, `fa-save` etc.): grey,
 * turning primary while the tool they arm is on. The label is the tooltip.
 */
function ToolButton({ active = false, className, children, 'aria-label': label, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; 'aria-label': string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={classicButtonClass(active ? 'primary' : 'default', 'md', clsx('w-9 h-8 px-0', className))}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Legacy's `.monitorStatus` line under the stream: name, state, fps. */
function StreamStatus({ monitor, runtime }: { monitor: Monitor; runtime: MonitorRuntime | undefined }) {
  const { t } = useTranslation();
  return (
    <p className="text-sm text-zinc-700 mt-1 flex flex-wrap gap-x-3" data-testid="zones-stream-status">
      <span>{t('{{name}} (id={{id}})', { name: monitor.name, id: monitor.id })}</span>
      {runtime && (
        <>
          <span>{t('State: {{state}}', { state: runtime.status })}</span>
          <span title={t('Capturing FPS')}>{t('{{fps}} fps', { fps: formatFpsLegacy(runtime.captureFpsRaw) })}</span>
        </>
      )}
    </p>
  );
}

/**
 * Zones — classic skin. Legacy `?view=zones&mid=`: the camera with every
 * zone's polygon, the Name / Type / Area / Mark table with Add New Zone and
 * Delete under it. A zone opened from the table or the picture is legacy's
 * separate `?view=zone&mid=&zid=` page (`?zid=` here).
 */
export default function ClassicMonitorZonesPage({ monitorId }: PagePropsMap['monitors.zones']) {
  const { t } = useTranslation();
  const page = useZonesListPage(monitorId);
  const canGoBack = useCanGoBack();
  const { can } = usePerms();
  const canEdit = can('monitors', 'Edit');
  const { monitor, view, zones, marked } = page;
  useDocumentTitle(page.editing != null ? t('Zone') : t('Zones'));

  if (page.editing != null && monitor && view && page.hasDimensions) {
    return (
      <AppShell title={t('Zone')}>
        <ClassicPage>
          <ClassicZoneView
            key={String(page.editing)}
            monitor={monitor}
            frame={view}
            zoneId={page.editing}
            runtime={page.runtime}
            canEdit={canEdit}
            canGoBack={canGoBack}
            onClose={page.closeEditor}
            onSelect={page.openEditor}
          />
        </ClassicPage>
      </AppShell>
    );
  }

  const frame = view ?? { width: 0, height: 0 };

  return (
    <AppShell title={t('Zones')}>
      <ClassicPage>
        <ClassicHeader backDisabled={!canGoBack} onRefresh={page.refetch} />
        <h2 className="text-base font-bold text-zinc-900 mb-2">{t('Zones')}</h2>
        <QueryState
          isLoading={page.isLoading}
          isError={page.zonesError}
          error={page.error}
          onRetry={page.refetch}
          empty={!monitor}
          emptyMessage={t('Monitor not found')}
        >
          <div className="flex flex-col lg:flex-row gap-4 items-start">
            <div className="flex-1 min-w-0 w-full">
              {monitor && (
                <ZonesPicture
                  monitor={monitor}
                  frame={frame}
                  zones={zones}
                  onZoneClick={page.openEditor}
                  canEditMonitor={canEdit}
                />
              )}
              {monitor && <StreamStatus monitor={monitor} runtime={page.runtime} />}
            </div>

            <div className="w-full lg:w-[36rem] shrink-0">
              <ClassicTable aria-label={t('Zones')}>
                <ClassicThead>
                  <tr>
                    <ClassicTh>{t('Name')}</ClassicTh>
                    <ClassicTh>{t('Type')}</ClassicTh>
                    <ClassicTh>{t('Area (px/%)')}</ClassicTh>
                    <ClassicTh className="text-center">{t('Mark')}</ClassicTh>
                  </tr>
                </ClassicThead>
                <tbody>
                  {zones.length === 0 && !page.zonesLoading && (
                    <tr><ClassicTd colSpan={4} className="text-center text-zinc-500">{t('No zones defined')}</ClassicTd></tr>
                  )}
                  {zones.map((z) => {
                    // Measured from the polygon: ZoneMinder's stored Area is
                    // not recomputed when the API changes Coords (zm-api#43).
                    const area = zoneArea(z, frame);
                    const staleArea = frame.width > 0 && zoneAreaMismatch(z, frame);
                    const oob = frame.width > 0 && zoneOutOfBounds(z, frame);
                    return (
                      <tr key={z.id}>
                        <ClassicTd>
                          <button
                            type="button"
                            onClick={() => page.openEditor(z.id)}
                            className="text-[#337ab7] hover:underline"
                          >
                            {z.name}
                          </button>
                          {oob && (
                            <span
                              className="ms-1.5 inline-flex align-middle text-amber-500"
                              title={t('Zone coordinates extend beyond image dimensions ({{w}}x{{h}}). Points have been clamped.', { w: frame.width, h: frame.height })}
                            >
                              <AlertTriangle size={14} aria-label={t('Zone extends outside the frame')} />
                            </span>
                          )}
                        </ClassicTd>
                        <ClassicTd>{zoneTypeLabel(z.type, t)}</ClassicTd>
                        <ClassicTd className="tabular-nums">
                          {area.px.toLocaleString()} / {area.pct.toFixed(2)}
                          {staleArea && (
                            <span
                              className="ms-1 text-amber-700"
                              title={t(
                                "ZoneMinder's stored area ({{stored}}) disagrees with the polygon; it is not recomputed when the coordinates change.",
                                { stored: (z.area ?? 0).toLocaleString() },
                              )}
                            >
                              *
                            </span>
                          )}
                        </ClassicTd>
                        <ClassicTd className="text-center">
                          <input
                            type="checkbox"
                            checked={marked.has(z.id)}
                            onChange={() => page.toggleMark(z.id)}
                            disabled={!canEdit}
                            aria-label={t('Mark {{name}}', { name: z.name })}
                          />
                        </ClassicTd>
                      </tr>
                    );
                  })}
                </tbody>
              </ClassicTable>
              <RequirePerm feature="monitors" level="Edit">
                <div className="flex justify-end gap-2 mt-2">
                  <ClassicButton icon={<PlusCircle size={14} />} onClick={() => page.openEditor('new')} disabled={!page.hasDimensions}>
                    {t('Add New Zone')}
                  </ClassicButton>
                  <ClassicButton icon={<Trash2 size={14} />} onClick={page.deleteMarked} disabled={marked.size === 0 || page.busy}>
                    {t('Delete')}
                  </ClassicButton>
                </div>
              </RequirePerm>
            </div>
          </div>
        </QueryState>
      </ClassicPage>
    </AppShell>
  );
}

/**
 * Legacy `?view=zone&mid=&zid=` (`views/zone.php`): Back / Refresh, then
 * Save / Reset / Cancel; "Monitor X - Zone Y"; the stream with the polygon
 * and its tool buttons and Player select; the settings table, the rectangle
 * measurement table and the two-column point table.
 */
function ClassicZoneView({ monitor, frame, zoneId, runtime, canEdit, canGoBack, onClose, onSelect }: {
  monitor: Monitor;
  frame: { width: number; height: number };
  zoneId: number | 'new';
  runtime: MonitorRuntime | undefined;
  canEdit: boolean;
  canGoBack: boolean;
  onClose: () => void;
  onSelect: (id: number | 'new') => void;
}) {
  const { t } = useTranslation();
  const editor = useZoneEditor({
    monitorId: monitor.id,
    width: frame.width,
    height: frame.height,
    openZoneId: zoneId,
    onSelectionChange: (id) => (id == null ? onClose() : onSelect(id)),
  });
  const tool = useObjectSizeTool(editor);
  const player = useZonePlayer(monitor.default_player);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { draft, enabled } = editor;
  const input = clsx(classicInputClass, 'w-20 tabular-nums disabled:bg-zinc-100 disabled:text-zinc-400');
  const changed = (f: string) => tool.changed.has(f);

  const end = (
    <>
      <ToolButton
        aria-label={t('Save')}
        onClick={editor.save}
        disabled={!canEdit || !draft || editor.saving || draft.points.length < 3 || !draft.name.trim() || editor.selfIntersecting}
      >
        <Save size={16} aria-hidden />
      </ToolButton>
      <ToolButton aria-label={t('Reset')} onClick={editor.reset} disabled={!editor.dirty}>
        <RotateCcw size={16} aria-hidden />
      </ToolButton>
      <ToolButton aria-label={t('Cancel')} onClick={editor.cancel}>
        <X size={16} aria-hidden />
      </ToolButton>
    </>
  );

  const numInput = (field: ZoneNumField, label: string, max?: number) => (
    <input
      type="number"
      min={0}
      max={max}
      value={draft?.nums[field] ?? ''}
      disabled={!enabled?.[field]}
      aria-label={label}
      onChange={(e) => editor.setNum(field, e.target.value)}
      className={clsx(input, changed(field) && 'ring-1 ring-green-600')}
    />
  );
  const areaRow = (label: string, min: ZoneAreaField, max: ZoneAreaField) => (
    <tr>
      <th scope="row" className="text-start font-semibold pe-2 py-1 align-top">{label}</th>
      <td className="py-1 pe-2">
        <AreaPair editor={editor} field={min} label={t('{{label}} (min)', { label })} inputClassName={input} changed={changed(min)} />
      </td>
      <td className="py-1">
        <AreaPair editor={editor} field={max} label={t('{{label}} (max)', { label })} inputClassName={input} changed={changed(max)} />
      </td>
    </tr>
  );

  return (
    <>
      <ClassicHeader
        backDisabled={!canGoBack}
        onRefresh={() => { editor.reset(); }}
        end={end}
      />
      <h2 className="text-base font-bold text-zinc-900 mb-2">
        {t('Monitor {{monitor}} - Zone {{zone}}', { monitor: monitor.name, zone: draft?.name ?? '' })}
      </h2>
      {!draft ? (
        <p className="text-sm text-zinc-600">{editor.zonesLoading ? t('Loading…') : t('Zone not found')}</p>
      ) : (
        <div className="flex flex-col xl:flex-row gap-4 items-start">
          <div className="flex-1 min-w-0 w-full">
            <ZoneCanvas
              monitorWidth={frame.width}
              monitorHeight={frame.height}
              background={
                <ZoneLiveView
                  monitorId={monitor.id}
                  player={player.resolved}
                  stillUrl={tool.stillShown ? tool.stillUrl : null}
                  frame={frame}
                  orientation={monitor.orientation}
                />
              }
              otherZones={editor.zones.filter((z) => z.id !== draft.id)}
              draft={draft}
              onDraftPointsChange={(points) => editor.setDraft({ ...draft, points })}
              measure={tool}
            />
            <StreamStatus monitor={monitor} runtime={runtime} />
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <ToolButton
                aria-label={tool.stillShown ? t('Go back to the live view') : t('Measure against a still image instead of the live view')}
                aria-pressed={tool.stillShown}
                active={tool.stillShown}
                onClick={() => {
                  if (!tool.stillUrl) fileRef.current?.click();
                  else tool.setStillShown(!tool.stillShown);
                }}
              >
                <ImageIcon size={16} aria-hidden />
              </ToolButton>
              {tool.stillShown && (
                <ClassicButton size="sm" onClick={() => fileRef.current?.click()}>{t('Replace this image')}</ClassicButton>
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
              <ToolButton
                aria-label={t('Drag a box around the smallest object that should trigger an alarm, or type its size below')}
                aria-pressed={tool.armed}
                active={tool.armed}
                onClick={tool.toggleArmed}
              >
                <Scan size={16} aria-hidden />
              </ToolButton>
              {tool.canUndo && (
                <ToolButton aria-label={t('Undo the last object measurement')} onClick={tool.undo}>
                  <Undo2 size={16} aria-hidden />
                </ToolButton>
              )}
              <ClassicSelect
                className="ms-auto"
                label={t('Player')}
                value={player.player}
                onChange={(v) => player.setPlayer(v as ZonePlayer)}
                options={player.options}
              />
            </div>
            {tool.message && <p role="alert" className="text-sm text-amber-700 mt-1">{tool.message}</p>}
          </div>

          <div className="w-full xl:w-[38rem] shrink-0 text-sm text-zinc-900">
            <table className="w-full" aria-label={t('Zone settings')}>
              <tbody>
                <tr>
                  <th scope="row" className="text-start font-semibold pe-2 py-1">{t('Name')}</th>
                  <td colSpan={2} className="py-1">
                    <input
                      aria-label={t('Name')}
                      value={draft.name}
                      onChange={(e) => editor.setDraft({ ...draft, name: e.target.value })}
                      className={clsx(classicInputClass, 'w-full')}
                    />
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="text-start font-semibold pe-2 py-1">{t('Type')}</th>
                  <td colSpan={2} className="py-1">
                    <select
                      aria-label={t('Type')}
                      value={draft.type}
                      onChange={(e) => editor.setDraft({ ...draft, type: e.target.value })}
                      className={classicInputClass}
                    >
                      {ZONE_TYPE_ORDER.map((type) => <option key={type} value={type}>{zoneTypeLabel(type, t)}</option>)}
                    </select>
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="text-start font-semibold pe-2 py-1">{t('Preset')}</th>
                  <td colSpan={2} className="py-1">
                    <select
                      aria-label={t('Preset')}
                      value=""
                      disabled={draft.type === 'Inactive' || draft.type === 'Privacy'}
                      onChange={(e) => { if (e.target.value) editor.applyPreset(Number(e.target.value)); }}
                      className={classicInputClass}
                    >
                      <option value="">{t('Choose Preset')}</option>
                      {editor.presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="text-start font-semibold pe-2 py-1">{t('Alarm Colour (Red/Green/Blue)')}</th>
                  <td colSpan={2} className="py-1">
                    <span className="inline-flex items-center gap-1">
                      <input
                        type="color"
                        aria-label={t('Alarm Colour')}
                        value={alarmToHex(draft.alarm)}
                        disabled={!enabled?.alarm_rgb}
                        onChange={(e) => editor.setAlarmHex(e.target.value)}
                        className="h-6 w-10"
                      />
                      {(['r', 'g', 'b'] as const).map((ch, i) => (
                        <span key={ch} className="inline-flex items-center gap-1">
                          {i > 0 && '/'}
                          <input
                            type="number"
                            min={0}
                            max={255}
                            aria-label={ch === 'r' ? t('Red') : ch === 'g' ? t('Green') : t('Blue')}
                            value={draft.alarm[ch]}
                            disabled={!enabled?.alarm_rgb}
                            onChange={(e) => editor.setAlarmChannel(ch, e.target.value)}
                            className={clsx(classicInputClass, 'w-16 disabled:bg-zinc-100 disabled:text-zinc-400')}
                          />
                        </span>
                      ))}
                    </span>
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="text-start font-semibold pe-2 py-1">{t('Alarm Check Method')}</th>
                  <td colSpan={2} className="py-1">
                    <select
                      aria-label={t('Check Method')}
                      value={draft.checkMethod}
                      disabled={!enabled?.check_method}
                      onChange={(e) => editor.setDraft({ ...draft, checkMethod: e.target.value })}
                      className={clsx(classicInputClass, changed('check_method') && 'ring-1 ring-green-600')}
                    >
                      {/* Legacy prints the enum values as they are. */}
                      {CHECK_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="text-start font-semibold pe-2 py-1">{t('Min/Max Pixel Threshold (0-255)')}</th>
                  <td className="py-1 pe-2">{numInput('min_pixel_threshold', t('Min/Max Pixel Threshold (min)'), 255)}</td>
                  <td className="py-1">{numInput('max_pixel_threshold', t('Min/Max Pixel Threshold (max)'), 255)}</td>
                </tr>
                <tr>
                  <th scope="row" className="text-start font-semibold pe-2 py-1">{t('Filter Width/Height (pixels)')}</th>
                  <td className="py-1 pe-2">
                    <FilterSizeInput editor={editor} field="filter_x" label={t('Filter width')} className={input} changed={changed('filter_x')} />
                  </td>
                  <td className="py-1">
                    <FilterSizeInput editor={editor} field="filter_y" label={t('Filter height')} className={input} changed={changed('filter_y')} />
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="text-start font-semibold pe-2 py-1">{t('Zone Area')}</th>
                  <td className="py-1 pe-2 tabular-nums" data-testid="zone-area-percent">{t('{{pct}}%', { pct: Math.round(editor.zonePct) })}</td>
                  <td className="py-1 tabular-nums" data-testid="zone-area-pixels">{t('{{px}} px', { px: editor.zonePx })}</td>
                </tr>
                {areaRow(t('Min/Max Alarmed Area'), 'min_alarm_pixels', 'max_alarm_pixels')}
                {areaRow(t('Min/Max Filtered Area'), 'min_filter_pixels', 'max_filter_pixels')}
                {areaRow(t('Min/Max Blob Area'), 'min_blob_pixels', 'max_blob_pixels')}
                <tr>
                  <th scope="row" className="text-start font-semibold pe-2 py-1">{t('Min/Max Blobs')}</th>
                  <td className="py-1 pe-2">{numInput('min_blobs', t('Min/Max Blobs (min)'))}</td>
                  <td className="py-1">{numInput('max_blobs', t('Min/Max Blobs (max)'))}</td>
                </tr>
                <tr>
                  <th scope="row" className="text-start font-semibold pe-2 py-1">{t('Overload Frame Ignore Count')}</th>
                  <td colSpan={2} className="py-1">{numInput('overload_frames', t('Overload Frame Ignore Count'))}</td>
                </tr>
                <tr>
                  <th scope="row" className="text-start font-semibold pe-2 py-1">{t('Extend Alarm Frame Count')}</th>
                  <td colSpan={2} className="py-1">{numInput('extend_alarm_frames', t('Extend Alarm Frame Count'))}</td>
                </tr>
              </tbody>
            </table>

            {tool.showSettings && <ClassicRectangleSettings tool={tool} input={input} />}

            <PointTable
              className="mt-3"
              columns={2}
              points={draft.points}
              maxX={frame.width}
              maxY={frame.height}
              onChange={(points) => editor.setDraft({ ...draft, points })}
              inputClassName={classicInputClass}
            />

            {editor.selfIntersecting && (
              <p role="alert" className="mt-2 text-sm text-red-700">{t('Polygon edges must not intersect')}</p>
            )}
            {editor.errors.length > 0 && (
              <ul role="alert" aria-label={t('Cannot save the zone')} className="mt-2 text-sm text-red-700 list-disc ps-5">
                {editor.errors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Legacy `#rectangleSettings` (`zone.php:339-372`). */
function ClassicRectangleSettings({ tool, input }: { tool: ObjectSizeToolState; input: string }) {
  const { t } = useTranslation();
  const ratio = (key: 'fraction' | 'filter' | 'blob', label: string, hint: string) => (
    <tr>
      <th scope="row" className="text-start font-semibold pe-2 py-1">{label}</th>
      <td className="py-1">
        <input
          type="number"
          min={1}
          max={100}
          step={1}
          key={`${key}-${tool.ratios[key]}`}
          defaultValue={tool.ratios[key]}
          aria-label={label}
          onBlur={(e) => tool.setRatio(key, e.target.value)}
          className={input}
        />
        %
        <span className="ms-2 text-zinc-500">{hint}</span>
      </td>
    </tr>
  );
  return (
    <table className="w-full mt-3" aria-label={t('Rectangle measurement')}>
      <caption className="text-start font-bold">{t('Rectangle measurement')}</caption>
      <tbody>
        <tr>
          <th scope="row" className="text-start font-semibold pe-2 py-1">{t('Object size')}</th>
          <td className="py-1">
            <span className="inline-flex flex-wrap items-center gap-1">
              <input
                type="number" min={1} step={1}
                value={tool.typedWidth}
                onChange={(e) => tool.setTypedWidth(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); tool.applyTypedSize(); } }}
                aria-label={t('Object width in pixels')}
                title={t('Object width in pixels')}
                className={input}
              />
              ×
              <input
                type="number" min={1} step={1}
                value={tool.typedHeight}
                onChange={(e) => tool.setTypedHeight(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); tool.applyTypedSize(); } }}
                aria-label={t('Object height in pixels')}
                title={t('Object height in pixels')}
                className={input}
              />
              {t('px')}
              <ClassicButton size="sm" onClick={tool.applyTypedSize} title={t('Derive the detection settings from this object size')}>
                {t('Apply')}
              </ClassicButton>
              <span className="text-zinc-500">{t('in capture pixels, if you would rather not draw')}</span>
            </span>
          </td>
        </tr>
        {ratio('fraction', t('Alarmed area'), t('of the drawn rectangle'))}
        {ratio('filter', t('Filtered area'), t('of alarmed area'))}
        {ratio('blob', t('Blob area'), t('of filtered area'))}
      </tbody>
    </table>
  );
}
