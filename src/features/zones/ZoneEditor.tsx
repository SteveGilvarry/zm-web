import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { clsx } from 'clsx';
import { Plus, Save, Trash2, X, Square } from 'lucide-react';
import {
  listZonesForMonitor, createZone, updateZone, deleteZone,
  parseCoords, serializeCoords, insertMidpoint,
  type Zone, type ZoneType, type Point,
} from '@/api/zones';
import { useRefreshingSnapshot } from '@/hooks/useRefreshingSnapshot';

interface ZoneEditorProps {
  monitorId: number;
  width: number;
  height: number;
}

const ZONE_TYPE_COLORS: Record<string, { stroke: string; fill: string; label: string }> = {
  Active:     { stroke: '#00d4ff', fill: 'rgba(0,212,255,0.18)',  label: 'Active' },
  Inclusive:  { stroke: '#00ff9d', fill: 'rgba(0,255,157,0.18)',  label: 'Inclusive' },
  Exclusive:  { stroke: '#ffb000', fill: 'rgba(255,176,0,0.18)',  label: 'Exclusive' },
  Preclusive: { stroke: '#a855f7', fill: 'rgba(168,85,247,0.18)', label: 'Preclusive' },
  Inactive:   { stroke: '#566b85', fill: 'rgba(86,107,133,0.15)', label: 'Inactive' },
  Privacy:    { stroke: '#ff3366', fill: 'rgba(255,51,102,0.22)', label: 'Privacy' },
};
const ZONE_TYPE_ORDER: ZoneType[] = ['Active', 'Inclusive', 'Exclusive', 'Preclusive', 'Inactive', 'Privacy'];

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
export function ZoneEditor({ monitorId, width, height }: ZoneEditorProps) {
  const qc = useQueryClient();

  const zonesQ = useQuery({
    queryKey: ['zones', monitorId],
    queryFn: () => listZonesForMonitor(monitorId, { page: 1, page_size: 50 }),
  });
  const zones: Zone[] = zonesQ.data?.items ?? [];

  // Drives the snapshot below the polygon — keeps the editor visually live.
  const snapshotUrl = useRefreshingSnapshot(monitorId, true);

  const [selectedId, setSelectedId] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState<{
    id: number | null;
    name: string;
    type: string;
    points: Point[];
  } | null>(null);

  // When the user picks a zone from the list, hydrate the local draft.
  const loadZone = (z: Zone) => {
    setSelectedId(z.id);
    setDraft({
      id: z.id,
      name: z.name,
      type: z.type,
      points: parseCoords(z.coords),
    });
  };
  const startNewZone = () => {
    setSelectedId('new');
    // Default rectangle: middle 60% of the frame.
    const m = 0.2;
    setDraft({
      id: null,
      name: 'New zone',
      type: 'Active',
      points: [
        { x: width * m,         y: height * m         },
        { x: width * (1 - m),   y: height * m         },
        { x: width * (1 - m),   y: height * (1 - m)   },
        { x: width * m,         y: height * (1 - m)   },
      ],
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
          units: 'Pixels',
          coords,
          num_coords: draft.points.length,
        });
      } else {
        await updateZone(draft.id, { name: draft.name, polygon: coords });
      }
    },
    onSuccess: () => {
      invalidate();
      setSelectedId(null);
      setDraft(null);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteZone(id),
    onSuccess: () => {
      invalidate();
      setSelectedId(null);
      setDraft(null);
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
        onDraftPointsChange={(points) =>
          setDraft((d) => (d ? { ...d, points } : d))
        }
      />

      {/* Sidebar — zone list + form */}
      <div className="space-y-3">
        <div className="rounded-lg border border-border-subtle bg-surface/40 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted">
              Zones
            </span>
            <button
              onClick={startNewZone}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded border border-cyan/40 text-cyan hover:bg-cyan/15 transition-colors"
            >
              <Plus size={10} />
              New
            </button>
          </div>
          {zonesQ.isLoading ? (
            <div className="p-4 text-center text-xs text-text-muted">Loading…</div>
          ) : zones.length === 0 ? (
            <div className="p-4 text-center text-xs text-text-muted italic">
              No zones yet. Click <strong>New</strong> to draw one.
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
                        'w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs border-l-2 transition-colors',
                        selectedId === z.id
                          ? 'bg-cyan/10'
                          : 'hover:bg-surface/80',
                      )}
                      style={{ borderLeftColor: c.stroke }}
                    >
                      <Square size={10} style={{ color: c.stroke }} fill={c.fill} />
                      <span className="text-text-primary truncate flex-1">{z.name}</span>
                      <span className="text-[10px] font-mono uppercase text-text-muted">{z.type}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Editor form */}
        {draft && (
          <div className="rounded-lg border border-cyan/40 bg-panel/50 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-cyan">
                {draft.id == null ? 'New zone' : `Editing #${draft.id}`}
              </span>
              <button
                onClick={() => { setSelectedId(null); setDraft(null); }}
                aria-label="Cancel edit"
                className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
              >
                <X size={11} />
              </button>
            </div>

            <Field label="Name">
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="flex-1 px-2 py-1 text-xs bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
              />
            </Field>
            <Field label="Type">
              <select
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                className="flex-1 px-2 py-1 text-xs bg-surface border border-border-subtle rounded text-text-primary focus:outline-none focus:border-cyan/50"
              >
                {ZONE_TYPE_ORDER.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>
            <div className="text-[10px] text-text-muted">
              {draft.points.length} vertices · click an edge dot to insert ·
              Alt-click a vertex to remove
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              {draft.id != null && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Delete zone "${draft.name}"?`)) deleteMutation.mutate(draft.id!);
                  }}
                  disabled={deleteMutation.isPending}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-crimson/40 text-crimson hover:bg-crimson/15 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={10} />
                  Delete
                </button>
              )}
              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || draft.points.length < 3 || !draft.name.trim()}
                className="flex items-center gap-1 px-3 py-1 text-[11px] font-medium rounded border border-cyan/50 bg-cyan/15 text-cyan hover:bg-cyan/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={10} />
                Save
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
      <label className="text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted w-12">
        {label}
      </label>
      {children}
    </div>
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
    <div className="relative w-full rounded-lg overflow-hidden border border-border-subtle bg-abyss">
      {/* Snapshot — sized via aspect-ratio to the camera resolution */}
      <div className="relative" style={{ aspectRatio: `${monitorWidth} / ${monitorHeight}` }}>
        {snapshotUrl && (
          <img
            src={snapshotUrl}
            alt="Monitor snapshot"
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
