import {
  useCallback,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { clsx } from 'clsx';
import { SplitSquareHorizontal, SplitSquareVertical, X, Camera } from 'lucide-react';
import {
  type LayoutNode,
  type Path,
  resizeAt,
} from './mosaic';

interface MosaicViewProps {
  tree: LayoutNode;
  onChange: (next: LayoutNode) => void;
  renderCell: (monitorId: number | null, path: Path) => ReactNode;
  /** Called when the operator clicks split / close on a cell. */
  onSplit: (path: Path, direction: 'row' | 'column') => void;
  onClose: (path: Path) => void;
  /** Called when the operator wants to assign a monitor to a vacant cell. */
  onChooseMonitor?: (path: Path) => void;
}

/**
 * Recursive renderer for the layout tree. Internal split nodes render
 * as flex containers; leaves render via the provided renderCell. Every
 * adjacent pair of children in a split is separated by a draggable
 * Divider that updates the split's sizes in real time.
 *
 * Edit controls (split horizontal / split vertical / close) appear on
 * cell hover so they don't clutter normal viewing.
 */
export function MosaicView({
  tree,
  onChange,
  renderCell,
  onSplit,
  onClose,
  onChooseMonitor,
}: MosaicViewProps) {
  return (
    <div className="flex flex-col w-full h-full flex-1 min-h-0">
      <MosaicNode
        tree={tree}
        node={tree}
        path={[]}
        onChange={onChange}
        renderCell={renderCell}
        onSplit={onSplit}
        onClose={onClose}
        onChooseMonitor={onChooseMonitor}
      />
    </div>
  );
}

interface MosaicNodeProps {
  tree: LayoutNode;
  node: LayoutNode;
  path: Path;
  onChange: (next: LayoutNode) => void;
  renderCell: (monitorId: number | null, path: Path) => ReactNode;
  onSplit: (path: Path, direction: 'row' | 'column') => void;
  onClose: (path: Path) => void;
  onChooseMonitor?: (path: Path) => void;
}

function MosaicNode(props: MosaicNodeProps) {
  const { node, path, renderCell, onSplit, onClose, onChooseMonitor } = props;

  if (node.type === 'leaf') {
    return (
      <Cell
        monitorId={node.monitorId}
        path={path}
        renderCell={renderCell}
        onSplit={onSplit}
        onClose={onClose}
        onChooseMonitor={onChooseMonitor}
      />
    );
  }

  const isRow = node.direction === 'row';

  return (
    <div
      className={clsx(
        'flex flex-1 min-w-0 min-h-0',
        isRow ? 'flex-row' : 'flex-col',
      )}
    >
      {node.children.flatMap((child, i) => {
        const flex = node.sizes[i] ?? 1 / node.children.length;
        const slotKey = `slot-${i}`;
        const childEl = (
          <div
            key={slotKey}
            className="flex min-w-0 min-h-0"
            style={{ flex: `${flex} ${flex} 0` }}
          >
            <MosaicNode {...props} node={child} path={[...path, i]} />
          </div>
        );
        if (i === node.children.length - 1) return [childEl];
        return [
          childEl,
          <Divider
            key={`div-${i}`}
            splitPath={path}
            splitDirection={node.direction}
            boundaryIndex={i}
            currentSizes={node.sizes}
            tree={props.tree}
            onChange={props.onChange}
          />,
        ];
      })}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/*  Divider                                                                 */
/* ------------------------------------------------------------------------ */

interface DividerProps {
  splitPath: Path;
  splitDirection: 'row' | 'column';
  boundaryIndex: number;
  currentSizes: number[];
  tree: LayoutNode;
  onChange: (next: LayoutNode) => void;
}

/**
 * Draggable bar between two siblings in a split. Updates the parent
 * split's sizes by transferring share from the left/top sibling to
 * the right/bottom sibling (or vice versa) based on the pointer's
 * movement, measured against the split's own bounding box so the
 * math is independent of viewport size.
 */
function Divider({
  splitPath,
  splitDirection,
  boundaryIndex,
  currentSizes,
  tree,
  onChange,
}: DividerProps) {
  const dragState = useRef<{
    parentRect: DOMRect;
    startSizes: number[];
  } | null>(null);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const splitEl = e.currentTarget.parentElement;
      if (!splitEl) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragState.current = {
        parentRect: splitEl.getBoundingClientRect(),
        startSizes: currentSizes.slice(),
      };
    },
    [currentSizes],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const st = dragState.current;
      if (!st) return;
      const isRow = splitDirection === 'row';
      const totalPx = isRow ? st.parentRect.width : st.parentRect.height;
      if (totalPx <= 0) return;
      // Cursor position within the split, normalised to 0..1.
      const cursorPx = isRow
        ? e.clientX - st.parentRect.left
        : e.clientY - st.parentRect.top;
      const cursorRatio = Math.max(0.05, Math.min(0.95, cursorPx / totalPx));

      // Boundary is between children[boundaryIndex] and children[boundaryIndex+1].
      // The cursor's normalised position becomes the cumulative size up to
      // and including children[boundaryIndex]. Distribute the diff between
      // the two affected siblings only (preserving every other sibling's
      // share).
      const cumBefore = st.startSizes
        .slice(0, boundaryIndex + 1)
        .reduce((s, v) => s + v, 0);
      const cumWithNext = cumBefore + st.startSizes[boundaryIndex + 1];
      // Clamp so neither sibling collapses past a 5% minimum.
      const minShare = 0.05;
      const minCum = cumBefore - st.startSizes[boundaryIndex] + minShare;
      const maxCum = cumWithNext - minShare;
      const clampedCursor = Math.max(minCum, Math.min(maxCum, cursorRatio));

      const next = st.startSizes.slice();
      const delta = clampedCursor - cumBefore;
      next[boundaryIndex] = st.startSizes[boundaryIndex] + delta;
      next[boundaryIndex + 1] = st.startSizes[boundaryIndex + 1] - delta;
      onChange(resizeAt(tree, splitPath, next));
    },
    [splitDirection, boundaryIndex, tree, onChange, splitPath],
  );

  const handlePointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragState.current = null;
  }, []);

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={clsx(
        'flex-shrink-0 relative group/divider',
        splitDirection === 'row'
          ? 'w-1 h-full cursor-col-resize'
          : 'h-1 w-full cursor-row-resize',
      )}
      style={{ touchAction: 'none' }}
    >
      {/* Visual: a thin cyan-on-hover line; bigger hit area than the
          visible line so dragging is forgiving. */}
      <div
        className={clsx(
          'absolute inset-0 transition-colors',
          'bg-border-subtle/40 group-hover/divider:bg-cyan/60',
        )}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/*  Cell                                                                    */
/* ------------------------------------------------------------------------ */

interface CellProps {
  monitorId: number | null;
  path: Path;
  renderCell: (monitorId: number | null, path: Path) => ReactNode;
  onSplit: (path: Path, direction: 'row' | 'column') => void;
  onClose: (path: Path) => void;
  onChooseMonitor?: (path: Path) => void;
}

function Cell({
  monitorId,
  path,
  renderCell,
  onSplit,
  onClose,
  onChooseMonitor,
}: CellProps) {
  return (
    <div className="relative flex-1 min-w-0 min-h-0 bg-abyss border border-border-subtle rounded-md overflow-hidden group/cell">
      {/* Content (live stream / vacant placeholder) */}
      <div className="absolute inset-0">{renderCell(monitorId, path)}</div>

      {/* Vacant slot: a centred 'Choose monitor' affordance */}
      {monitorId == null && onChooseMonitor && (
        <button
          onClick={() => onChooseMonitor(path)}
          className={clsx(
            'absolute inset-0 flex flex-col items-center justify-center gap-2',
            'text-text-muted hover:text-cyan hover:bg-cyan/5 transition-colors',
          )}
        >
          <Camera size={24} />
          <span className="text-xs font-medium">Choose monitor</span>
        </button>
      )}

      {/* Hover controls — split / close in the top-right of every cell. */}
      <div className="absolute top-1 right-1 flex items-center gap-1 opacity-0 group-hover/cell:opacity-100 transition-opacity z-10">
        <IconBtn
          aria-label="Split horizontally"
          title="Split horizontally"
          onClick={() => onSplit(path, 'row')}
        >
          <SplitSquareHorizontal size={12} />
        </IconBtn>
        <IconBtn
          aria-label="Split vertically"
          title="Split vertically"
          onClick={() => onSplit(path, 'column')}
        >
          <SplitSquareVertical size={12} />
        </IconBtn>
        <IconBtn
          aria-label="Remove tile"
          title="Remove tile"
          tone="crimson"
          onClick={() => onClose(path)}
        >
          <X size={12} />
        </IconBtn>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  tone = 'cyan',
  ...rest
}: {
  children: ReactNode;
  tone?: 'cyan' | 'crimson';
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={clsx(
        'p-1 rounded backdrop-blur-sm border transition-colors',
        tone === 'crimson'
          ? 'bg-black/50 border-crimson/30 text-crimson/80 hover:bg-crimson/20 hover:text-crimson'
          : 'bg-black/50 border-cyan/30 text-cyan/80 hover:bg-cyan/20 hover:text-cyan',
      )}
    >
      {children}
    </button>
  );
}
