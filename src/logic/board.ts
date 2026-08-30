import type { Board, Cell, CellState, FireResult, Orientation, Position, Ship, ShipName } from './types';
import { BOARD_SIZE, SHIPS } from './types';

export function createEmptyBoard(): Board {
  const cells: Cell[][] = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    const rowCells: Cell[] = [];
    for (let col = 0; col < BOARD_SIZE; col++) {
      rowCells.push({ state: 'empty' as CellState, ship: null });
    }
    cells.push(rowCells);
  }
  return { cells, ships: [] };
}

export function cloneBoard(board: Board): Board {
  return structuredClone(board);
}

export function getShipDefinition(name: ShipName) {
  const def = SHIPS.find((s) => s.name === name);
  if (!def) throw new Error(`Unknown ship: ${name}`);
  return def;
}

export function computeShipPositions(
  start: Position,
  length: number,
  orientation: Orientation
): Position[] {
  const positions: Position[] = [];
  for (let i = 0; i < length; i++) {
    if (orientation === 'horizontal') {
      positions.push({ row: start.row, col: start.col + i });
    } else {
      positions.push({ row: start.row + i, col: start.col });
    }
  }
  return positions;
}

export function isInBounds(position: Position): boolean {
  return (
    position.row >= 0 &&
    position.row < BOARD_SIZE &&
    position.col >= 0 &&
    position.col < BOARD_SIZE
  );
}

export function canPlaceShip(
  board: Board,
  name: ShipName,
  start: Position,
  orientation: Orientation
): boolean {
  const { length } = getShipDefinition(name);
  const positions = computeShipPositions(start, length, orientation);

  if (!positions.every(isInBounds)) return false;

  // Ships cannot overlap (no adjacent ships is optional in classic rules; only no overlap required).
  for (const pos of positions) {
    if (board.cells[pos.row][pos.col].ship !== null) return false;
  }

  return true;
}

export function placeShip(
  board: Board,
  name: ShipName,
  start: Position,
  orientation: Orientation
): Board {
  if (!canPlaceShip(board, name, start, orientation)) {
    throw new Error('Cannot place ship at the requested position');
  }

  const newBoard = cloneBoard(board);
  const { length } = getShipDefinition(name);
  const positions = computeShipPositions(start, length, orientation);

  const ship: Ship = { name, length, positions, hits: 0, sunk: false };
  newBoard.ships.push(ship);

  for (const pos of positions) {
    newBoard.cells[pos.row][pos.col] = { state: 'empty', ship };
  }

  return newBoard;
}

export function removeShip(board: Board, name: ShipName): Board {
  const newBoard = cloneBoard(board);
  const index = newBoard.ships.findIndex((s) => s.name === name);
  if (index === -1) return newBoard;

  const ship = newBoard.ships[index];
  for (const pos of ship.positions) {
    newBoard.cells[pos.row][pos.col] = { state: 'empty', ship: null };
  }
  newBoard.ships.splice(index, 1);
  return newBoard;
}

export function hasShipNamed(board: Board, name: ShipName): boolean {
  return board.ships.some((s) => s.name === name);
}

export function fireAt(board: Board, row: number, col: number): { board: Board; result: FireResult } {
  const cell = board.cells[row][col];

  if (cell.state !== 'empty') {
    return { board, result: { ship: null, sunk: false, alreadyFired: true } };
  }

  const newBoard = cloneBoard(board);
  const targetCell = newBoard.cells[row][col];

  if (targetCell.ship) {
    const ship = targetCell.ship;
    targetCell.state = 'hit';
    ship.hits += 1;

    if (ship.hits === ship.length) {
      ship.sunk = true;
      // Mark every cell of the sunk ship as hit, which keeps the UI consistent.
      for (const pos of ship.positions) {
        newBoard.cells[pos.row][pos.col].state = 'hit';
      }
      return { board: newBoard, result: { ship, sunk: true, alreadyFired: false } };
    }

    return { board: newBoard, result: { ship, sunk: false, alreadyFired: false } };
  }

  targetCell.state = 'miss';
  return { board: newBoard, result: { ship: null, sunk: false, alreadyFired: false } };
}

export function isFleetSunk(board: Board): boolean {
  return board.ships.length > 0 && board.ships.every((ship) => ship.sunk);
}

export function getAllShipsPlaced(board: Board): boolean {
  return board.ships.length === SHIPS.length;
}

export function getUnplacedShipNames(board: Board): ShipName[] {
  const placed = new Set(board.ships.map((s) => s.name));
  return SHIPS.filter((s) => !placed.has(s.name)).map((s) => s.name);
}

export function randomInteger(max: number): number {
  return Math.floor(Math.random() * max);
}

export function placeShipRandomly(board: Board, name: ShipName, maxAttempts = 1000): Board {
  const { length } = getShipDefinition(name);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const orientation: Orientation = Math.random() < 0.5 ? 'horizontal' : 'vertical';
    const start: Position = {
      row: randomInteger(orientation === 'horizontal' ? BOARD_SIZE : BOARD_SIZE - length + 1),
      col: randomInteger(orientation === 'horizontal' ? BOARD_SIZE - length + 1 : BOARD_SIZE),
    };

    if (canPlaceShip(board, name, start, orientation)) {
      return placeShip(board, name, start, orientation);
    }
  }
  throw new Error(`Could not place ${name} after ${maxAttempts} attempts`);
}

export function randomizeFleet(board: Board = createEmptyBoard()): Board {
  let newBoard = cloneBoard(board);
  // Start from scratch for a clean random layout.
  newBoard = createEmptyBoard();
  for (const ship of SHIPS) {
    newBoard = placeShipRandomly(newBoard, ship.name);
  }
  return newBoard;
}
