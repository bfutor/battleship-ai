export type ShipName = 'Carrier' | 'Battleship' | 'Cruiser' | 'Submarine' | 'Destroyer';

export type Orientation = 'horizontal' | 'vertical';

export type CellState = 'empty' | 'hit' | 'miss';

export interface Position {
  row: number;
  col: number;
}

export interface Ship {
  name: ShipName;
  length: number;
  positions: Position[];
  hits: number;
  sunk: boolean;
}

export interface Cell {
  state: CellState;
  ship: Ship | null;
}

export interface Board {
  cells: Cell[][];
  ships: Ship[];
}

export const SHIPS: { name: ShipName; length: number }[] = [
  { name: 'Carrier', length: 5 },
  { name: 'Battleship', length: 4 },
  { name: 'Cruiser', length: 3 },
  { name: 'Submarine', length: 3 },
  { name: 'Destroyer', length: 2 },
];

export const BOARD_SIZE = 10;

export interface FireResult {
  ship: Ship | null;
  sunk: boolean;
  alreadyFired: boolean;
}
