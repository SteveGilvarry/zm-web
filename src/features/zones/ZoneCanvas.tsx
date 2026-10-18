import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { insertMidpoint, type Point, type Zone } from '@/api/zones';
import { coordsToPixels } from './zoneArea';
import type { PixelBox } from './objectSize';
import { ZONE_TYPE_COLORS } from './zoneTypes';


export interface ZoneCanvasMeasure {
  armed: boolean;
  box: PixelBox | null;
  measure: (a: Point, b: Point, final: boolean) => void;
}

interface ZoneCanvasProps {
  monitorWidth: number;
  monitorHeight: number;
  /** The picture under the polygon (`ZoneLiveView`). */
  background?: ReactNode;
  otherZones: Zone[];
  draft: { id: number | null; type: string; points: Point[] } | null;
  onDraftPointsChange: (points: Point[]) => void;
  /** The object-size tool: while armed, a drag draws a box instead. */
  measure?: ZoneCanvasMeasure;
}

/**
 * The SVG overlay does its math in the monitor's native pixel space and
 * relies on viewBox to scale to whatever rendered size the parent gives it.
 * Pointer coordinates are translated through the bounding rect.
 *
 * Each vertex is a draggable handle; click a midpoint dot to insert a new
 * vertex; Alt-click (or right-click) a vertex to delete it.
 */
export function ZoneCanvas({
  monitorWidth, monitorHeight, background, otherZones, draft, onDraftPointsChange, measure,
}: ZoneCanvasProps) {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [measureFrom, setMeasureFrom] = useState<Point | null>(null);
  const armed = !!measure?.armed;

  const toFrame = (clientX: number, clientY: number): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * monitorWidth;
    const y = ((clientY - rect.top) / rect.height) * monitorHeight;
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
      const next = draft.points.slice();
      next[dragIndex] = toFramePoint(svgRef.current, e.clientX, e.clientY, monitorWidth, monitorHeight);
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

  // The measuring drag: pointer capture keeps the moves coming when the
  // pointer leaves the picture, as legacy's does.
  const onMeasureDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!armed || !measure) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = toFrame(e.clientX, e.clientY);
    setMeasureFrom(p);
    measure.measure(p, p, false);
  };
  const onMeasureMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!armed || !measure || !measureFrom) return;
    measure.measure(measureFrom, toFrame(e.clientX, e.clientY), false);
  };
  const onMeasureUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!armed || !measure || !measureFrom) return;
    measure.measure(measureFrom, toFrame(e.clientX, e.clientY), true);
    setMeasureFrom(null);
  };

  const box = measure?.box;
  const labelSize = Math.max(14, monitorWidth / 60);

  return (
    <div dir="ltr" className="relative w-full rounded overflow-hidden border border-border-subtle bg-bg-sunken">
      <div className="relative" style={{ aspectRatio: `${monitorWidth} / ${monitorHeight}` }}>
        {background}

        <svg
          ref={svgRef}
          viewBox={`0 0 ${monitorWidth} ${monitorHeight}`}
          className="absolute inset-0 w-full h-full"
          preserveAspectRatio="xMidYMid meet"
          style={{ touchAction: 'none', cursor: armed ? 'crosshair' : undefined }}
          data-testid="zone-canvas"
          onPointerDown={onMeasureDown}
          onPointerMove={onMeasureMove}
          onPointerUp={onMeasureUp}
          onPointerCancel={onMeasureUp}
        >
          {/* Read-only other zones, drawn first so the editable one is on top */}
          {otherZones.map((z) => {
            const c = ZONE_TYPE_COLORS[z.type] ?? ZONE_TYPE_COLORS.Active;
            const pts = coordsToPixels(z.coords, { width: monitorWidth, height: monitorHeight })
              .map((p) => `${p.x},${p.y}`).join(' ');
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

          {/* Editable draft polygon + handles. Measuring stops the handles
              swallowing the drag. */}
          {draft && draftColor && (
            <g style={{ pointerEvents: armed ? 'none' : undefined }}>
              <PolygonEditable
                points={draft.points}
                color={draftColor}
                monitorWidth={monitorWidth}
                onVertexDown={(i, e) => {
                  if (e.altKey && draft.points.length > 3) {
                    onDraftPointsChange(draft.points.filter((_, idx) => idx !== i));
                    return;
                  }
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setDragIndex(i);
                }}
                onMidpointDown={(i) => {
                  onDraftPointsChange(insertMidpoint(draft.points, i));
                  // Start dragging the freshly-inserted vertex.
                  setDragIndex(i + 1);
                }}
              />
            </g>
          )}

          {box && (
            <g data-testid="zone-measure-box" pointerEvents="none">
              <rect
                x={box.x} y={box.y} width={box.w} height={box.h}
                fill="rgba(0,255,0,0.15)" stroke="#00ff00"
                strokeWidth={Math.max(2, monitorWidth / 500)}
                strokeDasharray="8 4"
              />
              <text
                x={box.x + 4}
                y={box.y < labelSize * 1.5 ? box.y + labelSize + 4 : box.y - 6}
                fill="#00ff00"
                fontSize={labelSize}
                stroke="#000"
                strokeWidth={labelSize / 8}
                paintOrder="stroke"
              >
                {t('{{w}}×{{h}} = {{area}} px', {
                  w: Math.round(box.w),
                  h: Math.round(box.h),
                  area: (Math.round(box.w) * Math.round(box.h)).toLocaleString(),
                })}
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

function toFramePoint(svg: SVGSVGElement, clientX: number, clientY: number, w: number, h: number): Point {
  const rect = svg.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * w;
  const y = ((clientY - rect.top) / rect.height) * h;
  return { x: Math.max(0, Math.min(w, x)), y: Math.max(0, Math.min(h, y)) };
}

interface PolygonEditableProps {
  points: Point[];
  color: { stroke: string; fill: string };
  monitorWidth: number;
  onVertexDown: (i: number, e: ReactPointerEvent<SVGCircleElement>) => void;
  onMidpointDown: (i: number) => void;
}

function PolygonEditable({ points, color, monitorWidth, onVertexDown, onMidpointDown }: PolygonEditableProps) {
  const { t } = useTranslation();
  const strokeWidth = Math.max(2, monitorWidth / 500);
  const vertexR = Math.max(8, monitorWidth / 120);
  const midR = vertexR * 0.55;

  const pointsStr = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <>
      <polygon points={pointsStr} fill={color.fill} stroke={color.stroke} strokeWidth={strokeWidth} />

      {/* Midpoint handles between consecutive vertices */}
      {points.map((p, i) => {
        const next = points[(i + 1) % points.length];
        return (
          <circle
            key={`mid-${i}`}
            cx={(p.x + next.x) / 2}
            cy={(p.y + next.y) / 2}
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
          onPointerDown={(e) => {
            e.stopPropagation();
            onVertexDown(i, e);
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <title>{t('Point {{n}}', { n: i + 1 })}</title>
        </circle>
      ))}
    </>
  );
}
