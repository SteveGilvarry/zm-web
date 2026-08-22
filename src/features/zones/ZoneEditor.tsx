import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { clsx } from 'clsx';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Plus, Save, Trash2, X, Square } from 'lucide-react';
import {
  listZonesForMonitor, createZone, updateZone, deleteZone,
  listZonePresets,
  parseCoords, serializeCoords, insertMidpoint,
  type Zone, type ZoneType, type Point,
} from '@/api/zones';
import { buttonClasses, fieldClasses } from '@/components/common/styles';
import { useRefreshingSnapshot } from '@/hooks/useRefreshingSnapshot';
import { zoneArea } from './zoneArea';

interface ZoneEditorProps {
  monitorId: number;
  width: number;
  height: number;
  /**
   * Zone the parent wants open — the classic list's row click, or `'new'`
   * for its Add New Zone. Omit to leave the editor uncontrolled.
   */
  openZoneId?: number | 'new' | null;
  /** Fires when the selection changes, so the parent can mirror it. */
  onSelectionChange?: (id: ZoneSelection) => void;
}

/** The zone the editor has open: an id, a not-yet-created zone, or nothing. */
export type ZoneSelection = number | 'new' | null;

interface ZoneDraft {
  id: number | null;
  name: string;
  type: string;
  units: 'Pixels' | 'Percent';
  points: Point[];
}

function draftFromZone(z: Zone): ZoneDraft {
  return {
    id: z.id,
    name: z.name,
    type: z.type,
    units: z.units === 'Percent' ? 'Percent' : 'Pixels',
    points: parseCoords(z.coords),
  };
}

/** A fresh zone starts as the middle 60% of the frame, like legacy's default. */
function newZoneDraft(width: number, height: number, name: string): ZoneDraft {
  const m = 0.2;
  return {
    id: null,
    name,
    type: 'Active',
    units: 'Pixels',
    points: [
      { x: width * m,       y: height * m       },
      { x: width * (1 - m), y: height * m       },
      { x: width * (1 - m), y: height * (1 - m) },
      { x: width * m,       y: height * (1 - m) },
    ],
  };
}

const ZONE_TYPE_COLORS: Record<string, { stroke: string; fill: string }> = {
  Active:     { stroke: '#00d4ff', fill: 'rgba(0,212,255,0.18)'  },
  Inclusive:  { stroke: '#00ff9d', fill: 'rgba(0,255,157,0.18)'  },
  Exclusive:  { stroke: '#ffb000', fill: 'rgba(255,176,0,0.18)'  },
  Preclusive: { stroke: '#a855f7', fill: 'rgba(168,85,247,0.18)' },
  Inactive:   { stroke: '#566b85', fill: 'rgba(86,107,133,0.15)' },
  Privacy:    { stroke: '#ff3366', fill: 'rgba(255,51,102,0.22)' },
};
const ZONE_TYPE_ORDER: ZoneType[] = ['Active', 'Inclusive', 'Exclusive', 'Preclusive', 'Inactive', 'Privacy'];

/** Display label for a zone type (wire value stays as-is). Unknown types echo back. */
function zoneTypeLabel(type: string, t: TFunction): string {
  switch (type) {
    case 'Active':     return t('Active');
    case 'Inclusive':  return t('Inclusive');
    case 'Exclusive':  return t('Exclusive');
    case 'Preclusive': return t('Preclusive');
    case 'Inactive':   return t('Inactive');
    case 'Privacy':    return t('Privacy');
    default:           return type;
  }
}

function zoneTypeHint(type: string, t: TFunction): string {
  switch (type) {
    case 'Active':     return t('Triggers alarms on motion inside this region.');
    case 'Inclusive':  return t('Motion only counts if it also overlaps an Active zone.');
    case 'Exclusive':  return t('Motion in this region is ignored.');
    case 'Preclusive': return t('If motion fills this region, the whole frame is rejected (camera shake).');
    case 'Inactive':   return t('Disabled — no detection here. Useful for parking it.');
    case 'Privacy':    return t('Region is blacked out in recordings and live view.');
    default:           return '';
  }
}

/**
 * SVG-overlay polygon editor over a refreshing camera snapshot. Each vertex
 * is a draggable handle; click a midpoint dot to insert a new vertex; click
 * a vertex's ring while holding Alt (or right-click) to delete it. The
 * polygon coordinate system is the camera's native pixel space so the same
 * coords round-trip the backend's "x,y x,y …" format unchanged.
 *
 * Edits stay in local state until the operator clicks Save; the form on the
 * right edits name + type while the canvas edits geometry.
 */
export function ZoneEditor({ monitorId, width, height, openZoneId, onSelectionChange }: ZoneEditorProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const zonesQ = useQuery({
    queryKey: ['zones', monitorId],
    queryFn: () => listZonesForMonitor(monitorId, { page: 1, page_size: 50 }),
  });
  const zones: Zone[] = useMemo(() => zonesQ.data?.items ?? [], [zonesQ.data]);

  // Drives the snapshot below the polygon — keeps the editor visually live.
  const snapshotUrl = useRefreshingSnapshot(monitorId, true);

  // Presets define reusable defaults (name/type/units/check_method) the
  // operator can apply to a new draft to avoid retyping a standard zone.
  const presetsQ = useQuery({
    queryKey: ['zonePresets'],
    queryFn: listZonePresets,
    staleTime: 5 * 60_000,
  });
  const presets = presetsQ.data?.items ?? [];

  // Selection is controlled when the parent passes `openZoneId` (both skins
  // do, so their list rows and settings panel stay in step) and owned here
  // otherwise. No effect syncs the two — that only ever fights the parent.
  const controlled = openZoneId !== undefined;
  const [internalId, setInternalId] = useState<ZoneSelection>(null);
  const selectedId: ZoneSelection = controlled ? openZoneId : internalId;

  const select = (id: ZoneSelection) => {
    if (!controlled) setInternalId(id);
    onSelectionChange?.(id);
  };

  // The draft the form starts from, rebuilt whenever the selection moves.
  const baseDraft = useMemo<ZoneDraft | null>(() => {
    if (selectedId == null) return null;
    if (selectedId === 'new') return newZoneDraft(width, height, t('New zone'));
    const z = zones.find((x) => x.id === selectedId);
    return z ? draftFromZone(z) : null; // null while the list is still loading
  }, [selectedId, zones, width, height, t]);

  // Unsaved edits, tagged with the zone they belong to. A refetch of the
  // list lands underneath without wiping what the operator typed, and
  // selecting another zone shows that zone's stored values again — no effect
  // resetting state, which is what the React Compiler rules forbid anyway.
  const [edited, setEdited] = useState<{ for: number | 'new'; draft: ZoneDraft } | null>(null);
  const draft = edited && edited.for === selectedId ? edited.draft : baseDraft;
  const setDraft = (next: ZoneDraft) => {
    if (selectedId != null) setEdited({ for: selectedId, draft: next });
  };

  const loadZone = (z: Zone) => select(z.id);
  const startNewZone = () => select('new');
  const clearSelection = () => {
    setEdited(null);
    select(null);
  };

  // Live area of the polygon being dragged; a draft has no stored area yet.
  const draftArea = draft
    ? zoneArea(
        { coords: serializeCoords(draft.points), units: draft.units },
        { width, height },
      )
    : null;
  // Units only change how ZoneMinder interprets the threshold fields
  // (min/max area etc.). Coords are always stored in pixels, so switching
  // units must leave the polygon alone.
  const setUnits = (units: 'Pixels' | 'Percent') => {
    if (!draft || draft.units === units) return;
    setDraft({ ...draft, units });
  };
  // Apply a preset's name/type/units to the current draft (preserves
  // whatever polygon the operator has drawn).
  const applyPreset = (presetId: number) => {
    const p = presets.find((x) => x.id === presetId);
    if (!p || !draft) return;
    setDraft({
      ...draft,
      name: p.name,
      type: p.type,
      units: (p.units === 'Percent' ? 'Percent' : 'Pixels') as 'Pixels' | 'Percent',
    });
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ['zones', monitorId] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error('no draft');
      const coords = serializeCoords(draft.points);
      if (draft.id == null) {
        await createZone(monitorId, {
          name: draft.name,
          type: draft.type,
          units: draft.units,
          coords,
          num_coords: draft.points.length,
        });
      } else {
        await updateZone(draft.id, { name: draft.name, polygon: coords });
      }
    },
    onSuccess: () => {
      invalidate();
      clearSelection();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteZone(id),
    onSuccess: () => {
      invalidate();
      clearSelection();
    },
  });

  return (
    <div className="grid grid-cols-[1fr_18rem] gap-4">
      {/* Canvas */}
      <ZoneCanvas
        monitorWidth={width}
        monitorHeight={height}
        snapshotUrl={snapshotUrl}
        otherZones={zones.filter((z) => draft?.id !== z.id)}
        draft={draft}
        onDraftPointsChange={(points) => { if (draft) setDraft({ ...draft, points }); }}
      />

      {/* Sidebar — zone list + form */}
      <div className="space-y-3">
        <div className="rounded border border-border-subtle bg-surface overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-subtle">
            <span className="text-label text-fg-dim">
              {t('Zones')}
            </span>
            <button
              onClick={startNewZone}
              className={buttonClasses('secondary', 'sm')}
            >
              <Plus size={10} />
              {t('New')}
            </button>
          </div>
          {zonesQ.isLoading ? (
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
                      onClick={() => loadZone(z)}
                      className={clsx(
                        'w-full flex items-center gap-2 px-3 py-1.5 text-start text-xs border-s-2 transition-colors',
                        selectedId === z.id
                          ? 'bg-accent/10'
                          : 'hover:bg-surface-2',
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

        {/* Editor form */}
        {draft && (
          <div className="rounded border border-border bg-surface p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-label text-fg">
                {draft.id == null ? t('New zone') : t('Editing #{{id}}', { id: draft.id })}
              </span>
              <button
                onClick={clearSelection}
                aria-label={t('Cancel edit')}
                className="p-1 rounded text-fg-dim hover:text-fg hover:bg-surface-2 transition-colors"
              >
                <X size={11} />
              </button>
            </div>

            <Field label={t('Name')}>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className={clsx('flex-1', fieldClasses('sm'))}
              />
            </Field>
            <Field label={t('Type')}>
              <select
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                className={clsx('flex-1', fieldClasses('sm'))}
              >
                {ZONE_TYPE_ORDER.map((type) => (
                  <option key={type} value={type}>{zoneTypeLabel(type, t)}</option>
                ))}
              </select>
            </Field>
            <div className="text-xs text-fg-dim italic px-1">
              {zoneTypeHint(draft.type, t)}
            </div>
            <Field label={t('Units')}>
              <div className="flex items-center gap-1 text-xs">
                <UnitToggleBtn
                  active={draft.units === 'Pixels'}
                  onClick={() => setUnits('Pixels')}
                  label={t('Pixels')}
                />
                <UnitToggleBtn
                  active={draft.units === 'Percent'}
                  onClick={() => setUnits('Percent')}
                  label={t('Percent')}
                />
              </div>
            </Field>
            {presets.length > 0 && (
              <Field label={t('Preset')}>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) applyPreset(Number(e.target.value));
                    e.target.value = '';
                  }}
                  className={clsx('flex-1', fieldClasses('sm'))}
                >
                  <option value="" disabled>{t('Apply preset…')}</option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </Field>
            )}
            {draftArea && (
              <div className="text-xs font-mono text-fg-dim">
                {/* "Draft", not "Zone Area": the settings panel shows the
                    stored Zones.Area, and the two disagree while you drag. */}
                {t('Draft area {{px}} px ({{pct}}%)', {
                  px: draftArea.px.toLocaleString(),
                  pct: draftArea.pct.toFixed(2),
                })}
              </div>
            )}
            <div className="text-xs text-fg-dim">
              {t('{{count}} vertex · click an edge dot to insert · Alt-click a vertex to remove', { count: draft.points.length })}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              {draft.id != null && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(t('Delete zone "{{name}}"?', { name: draft.name }))) deleteMutation.mutate(draft.id!);
                  }}
                  disabled={deleteMutation.isPending}
                  className={clsx(buttonClasses('secondary', 'sm'), 'text-danger hover:text-danger hover:border-danger/50')}
                >
                  <Trash2 size={10} />
                  {t('Delete')}
                </button>
              )}
              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || draft.points.length < 3 || !draft.name.trim()}
                className={buttonClasses('primary', 'sm')}
              >
                <Save size={10} />
                {t('Save')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-label text-fg-dim w-14 flex-shrink-0">
        {label}
      </label>
      {children}
    </div>
  );
}

function UnitToggleBtn({ active, onClick, label }: {
  active: boolean; onClick: () => void; label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={clsx(
        'px-2 py-0.5 rounded border transition-colors',
        active
          ? 'border-accent/30 bg-accent/12 text-accent'
          : 'border-border-subtle text-fg-dim hover:text-fg hover:bg-surface-2',
      )}
    >
      {label}
    </button>
  );
}

interface ZoneCanvasProps {
  monitorWidth: number;
  monitorHeight: number;
  snapshotUrl: string | null;
  otherZones: Zone[];
  draft: { id: number | null; name: string; type: string; points: Point[] } | null;
  onDraftPointsChange: (points: Point[]) => void;
}

/**
 * The SVG overlay does its math in the monitor's native pixel space and
 * relies on viewBox to scale to whatever rendered size the parent gives it.
 * Pointer coordinates are translated through the bounding rect.
 */
function ZoneCanvas({
  monitorWidth, monitorHeight, snapshotUrl, otherZones, draft, onDraftPointsChange,
}: ZoneCanvasProps) {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Translate a pointer event into native-pixel coords.
  const ptFromEvent = (e: ReactPointerEvent<Element>): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * monitorWidth;
    const y = ((e.clientY - rect.top) / rect.height) * monitorHeight;
    return {
      x: Math.max(0, Math.min(monitorWidth, x)),
      y: Math.max(0, Math.min(monitorHeight, y)),
    };
  };

  // Pointer move while dragging a vertex.
  useEffect(() => {
    if (dragIndex == null) return;
    const onMove = (e: PointerEvent) => {
      if (!draft || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * monitorWidth;
      const y = ((e.clientY - rect.top) / rect.height) * monitorHeight;
      const next = draft.points.slice();
      next[dragIndex] = {
        x: Math.max(0, Math.min(monitorWidth, x)),
        y: Math.max(0, Math.min(monitorHeight, y)),
      };
      onDraftPointsChange(next);
    };
    const onUp = () => setDragIndex(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragIndex, draft, monitorWidth, monitorHeight, onDraftPointsChange]);

  const draftColor = useMemo(
    () => (draft ? ZONE_TYPE_COLORS[draft.type] ?? ZONE_TYPE_COLORS.Active : null),
    [draft],
  );

  return (
    <div dir="ltr" className="relative w-full rounded overflow-hidden border border-border-subtle bg-bg-sunken">
      {/* Snapshot — sized via aspect-ratio to the camera resolution */}
      <div className="relative" style={{ aspectRatio: `${monitorWidth} / ${monitorHeight}` }}>
        {snapshotUrl && (
          <img
            src={snapshotUrl}
            alt={t('Monitor snapshot')}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          />
        )}

        <svg
          ref={svgRef}
          viewBox={`0 0 ${monitorWidth} ${monitorHeight}`}
          className="absolute inset-0 w-full h-full"
          preserveAspectRatio="xMidYMid meet"
          style={{ touchAction: 'none' }}
        >
          {/* Read-only other zones, drawn first so the editable one is on top */}
          {otherZones.map((z) => {
            const c = ZONE_TYPE_COLORS[z.type] ?? ZONE_TYPE_COLORS.Active;
            const pts = parseCoords(z.coords).map((p) => `${p.x},${p.y}`).join(' ');
            return (
              <polygon
                key={z.id}
                points={pts}
                fill={c.fill}
                stroke={c.stroke}
                strokeOpacity={0.4}
                strokeWidth={Math.max(2, monitorWidth / 600)}
                strokeDasharray="6 4"
              />
            );
          })}

          {/* Editable draft polygon + handles */}
          {draft && draftColor && (
            <PolygonEditable
              points={draft.points}
              color={draftColor}
              monitorWidth={monitorWidth}
              onVertexDown={(i, e) => {
                if (e.altKey && draft.points.length > 3) {
                  // Alt-click removes the vertex
                  const next = draft.points.filter((_, idx) => idx !== i);
                  onDraftPointsChange(next);
                  return;
                }
                e.currentTarget.setPointerCapture(e.pointerId);
                setDragIndex(i);
              }}
              onMidpointDown={(i) => {
                const next = insertMidpoint(draft.points, i);
                onDraftPointsChange(next);
                // Start dragging the freshly-inserted vertex.
                setDragIndex(i + 1);
              }}
              ptFromEvent={ptFromEvent}
            />
          )}
        </svg>
      </div>
    </div>
  );
}

interface PolygonEditableProps {
  points: Point[];
  color: { stroke: string; fill: string };
  monitorWidth: number;
  onVertexDown: (i: number, e: ReactPointerEvent<SVGCircleElement>) => void;
  onMidpointDown: (i: number) => void;
  ptFromEvent: (e: ReactPointerEvent<Element>) => Point;
}

function PolygonEditable({
  points, color, monitorWidth, onVertexDown, onMidpointDown,
}: PolygonEditableProps) {
  const strokeWidth = Math.max(2, monitorWidth / 500);
  const vertexR = Math.max(8, monitorWidth / 120);
  const midR = vertexR * 0.55;

  const pointsStr = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <>
      <polygon
        points={pointsStr}
        fill={color.fill}
        stroke={color.stroke}
        strokeWidth={strokeWidth}
      />

      {/* Midpoint handles between consecutive vertices */}
      {points.map((p, i) => {
        const next = points[(i + 1) % points.length];
        const mx = (p.x + next.x) / 2;
        const my = (p.y + next.y) / 2;
        return (
          <circle
            key={`mid-${i}`}
            cx={mx}
            cy={my}
            r={midR}
            fill="rgba(255,255,255,0.85)"
            stroke={color.stroke}
            strokeWidth={strokeWidth / 2}
            style={{ cursor: 'crosshair' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onMidpointDown(i);
            }}
          />
        );
      })}

      {/* Vertex handles */}
      {points.map((p, i) => (
        <circle
          key={`v-${i}`}
          cx={p.x}
          cy={p.y}
          r={vertexR}
          fill={color.stroke}
          stroke="#fff"
          strokeWidth={strokeWidth}
          style={{ cursor: 'grab' }}
          onPointerDown={(e) => onVertexDown(i, e)}
          onContextMenu={(e) => e.preventDefault()}
        />
      ))}
    </>
  );
}
