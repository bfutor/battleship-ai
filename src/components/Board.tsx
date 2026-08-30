import type React from 'react';
import type { Board, Position } from '../logic/types';
import './Board.css';

interface BoardProps {
  board: Board;
  label: string;
  isPlayerView: boolean;
  disabled?: boolean;
  previewCells?: Position[];
  previewValid?: boolean;
  onCellClick?: (row: number, col: number) => void;
  onCellHover?: (row: number, col: number) => void;
  onCellLeave?: () => void;
}

const ROW_LABELS = 'ABCDEFGHIJ'.split('');

function cellClass(
  cellState: 'empty' | 'hit' | 'miss',
  hasShip: boolean,
  isPlayerView: boolean,
  isPreview: boolean,
  previewValid: boolean
): string {
  const classes: string[] = ['cell'];

  if (isPreview) {
    classes.push(previewValid ? 'cell-preview-valid' : 'cell-preview-invalid');
  } else if (cellState === 'hit') {
    classes.push('cell-hit');
  } else if (cellState === 'miss') {
    classes.push('cell-miss');
  } else if (isPlayerView && hasShip) {
    classes.push('cell-ship');
  } else {
    classes.push('cell-empty');
  }

  return classes.join(' ');
}

export function BoardGrid({
  board,
  label,
  isPlayerView,
  disabled = false,
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
      const isInteractive = onCellClick && !disabled && cell.state === 'empty' && !isPlayerView;
      const isSetupTarget = onCellClick && !disabled && isPlayerView;
      gridItems.push(
        <button
          key={`cell-${row}-${col}`}
          type="button"
          className={cellClass(
            cell.state,
            cell.ship !== null,
            isPlayerView,
            isPreview,
            previewValid
          )}
          aria-label={`${ROW_LABELS[row]}${col + 1}`}
          disabled={!isInteractive && !isSetupTarget}
          onClick={() => onCellClick && onCellClick(row, col)}
          onMouseEnter={() => onCellHover && onCellHover(row, col)}
          onMouseLeave={() => onCellLeave && onCellLeave()}
        >
          {isPreview
            ? ''
            : cell.state === 'hit'
              ? '×'
              : cell.state === 'miss'
                ? '•'
                : ''}
        </button>
      );
    }
  }

  return (
    <div className="board-wrapper">
      <h2 className="board-label">{label}</h2>
      <div className="board-grid" aria-label={label}>
        {gridItems}
      </div>
    </div>
  );
}
