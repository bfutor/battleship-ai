import type React from 'react';
import type { Board, Position } from '../logic/types';
import './Board.css';

interface BoardProps {
  board: Board;
  label: string;
  isPlayerView: boolean;
  disabled?: boolean;
  active?: boolean;
  turnLabel?: string;
  pendingCell?: Position | null;
  previewCells?: Position[];
  previewValid?: boolean;
  onCellClick?: (row: number, col: number) => void;
  onCellHover?: (row: number, col: number) => void;
  onCellLeave?: () => void;
}

const ROW_LABELS = 'ABCDEFGHIJ'.split('');

type CellVisual = 'empty' | 'ship' | 'hit' | 'sunk' | 'miss' | 'pending' | 'preview-valid' | 'preview-invalid';

function getCellVisual(
  cellState: 'empty' | 'hit' | 'miss',
  hasShip: boolean,
  shipSunk: boolean,
  isPlayerView: boolean,
  isPreview: boolean,
  previewValid: boolean,
  isPending: boolean
): CellVisual {
  if (isPreview) return previewValid ? 'preview-valid' : 'preview-invalid';
  if (isPending) return 'pending';
  if (cellState === 'hit') return shipSunk ? 'sunk' : 'hit';
  if (cellState === 'miss') return 'miss';
  if (isPlayerView && hasShip) return 'ship';
  return 'empty';
}

function describeCell(visual: CellVisual): string {
  switch (visual) {
    case 'hit':
      return 'hit';
    case 'sunk':
      return 'sunk ship';
    case 'miss':
      return 'miss';
    case 'ship':
      return 'your ship';
    case 'pending':
      return 'firing';
    default:
      return '';
  }
}

function CellMark({ visual }: { visual: CellVisual }) {
  switch (visual) {
    case 'hit':
      return <span className="mark mark-hit" aria-hidden="true" />;
    case 'sunk':
      return <span className="mark mark-sunk" aria-hidden="true" />;
    case 'miss':
      return <span className="mark mark-miss" aria-hidden="true" />;
    case 'pending':
      return <span className="mark mark-pending" aria-hidden="true" />;
    case 'ship':
      return <span className="mark mark-ship" aria-hidden="true" />;
    default:
      return null;
  }
}

export function BoardGrid({
  board,
  label,
  isPlayerView,
  disabled = false,
  active = false,
  turnLabel,
  pendingCell = null,
  previewCells = [],
  previewValid = true,
  onCellClick,
  onCellHover,
  onCellLeave,
}: BoardProps) {
  const previewSet = new Set(previewCells.map((p) => `${p.row},${p.col}`));

  const gridItems: React.ReactNode[] = [];
  gridItems.push(<div key="corner" className="corner" />);

  for (let col = 0; col < 10; col++) {
    gridItems.push(
      <div key={`col-${col}`} className="header header-col">
        {col + 1}
      </div>
    );
  }

  for (let row = 0; row < 10; row++) {
    gridItems.push(
      <div key={`row-${row}`} className="header header-row">
        {ROW_LABELS[row]}
      </div>
    );
    for (let col = 0; col < 10; col++) {
      const cell = board.cells[row][col];
      const isPreview = previewSet.has(`${row},${col}`);
      const isPending = pendingCell !== null && pendingCell.row === row && pendingCell.col === col;
      const isInteractive =
        onCellClick && !disabled && cell.state === 'empty' && !isPlayerView && !isPending;
      const isSetupTarget = onCellClick && !disabled && isPlayerView;
      const visual = getCellVisual(
        cell.state,
        cell.ship !== null,
        cell.ship?.sunk ?? false,
        isPlayerView,
        isPreview,
        previewValid,
        isPending
      );
      const description = describeCell(visual);
      const coordinate = `${ROW_LABELS[row]}${col + 1}`;
      gridItems.push(
        <button
          key={`cell-${row}-${col}`}
          type="button"
          className={`cell cell-${visual}${isInteractive ? ' cell-targetable' : ''}`}
          aria-label={description ? `${coordinate}, ${description}` : coordinate}
          disabled={!isInteractive && !isSetupTarget}
          onClick={() => onCellClick && onCellClick(row, col)}
          onMouseEnter={() => onCellHover && onCellHover(row, col)}
          onMouseLeave={() => onCellLeave && onCellLeave()}
          onFocus={() => onCellHover && onCellHover(row, col)}
          onBlur={() => onCellLeave && onCellLeave()}
        >
          {!isPreview && <CellMark visual={visual} />}
        </button>
      );
    }
  }

  return (
    <div className={`board-wrapper${active ? ' board-active' : ''}`}>
      <div className="board-heading">
        <h2 className="board-label">{label}</h2>
        {turnLabel && (
          <span className={`board-turn-label${active ? ' is-active' : ''}`}>{turnLabel}</span>
        )}
      </div>
      <div className="board-grid" aria-label={label}>
        {gridItems}
      </div>
    </div>
  );
}
