import { describe, expect, it } from 'vitest';
import {
  canPlaceShip,
  createEmptyBoard,
  fireAt,
  getUnplacedShipNames,
  isFleetSunk,
  placeShip,
  randomizeFleet,
  removeShip,
} from './board';

describe('board logic', () => {
  it('creates an empty 10x10 board', () => {
    const board = createEmptyBoard();
    expect(board.cells.length).toBe(10);
    for (const row of board.cells) {
      expect(row.length).toBe(10);
      for (const cell of row) {
        expect(cell.state).toBe('empty');
        expect(cell.ship).toBeNull();
      }
    }
    expect(board.ships).toEqual([]);
  });

  it('places a ship horizontally', () => {
    const board = placeShip(createEmptyBoard(), 'Carrier', { row: 0, col: 0 }, 'horizontal');
    expect(board.ships).toHaveLength(1);
    expect(board.ships[0].name).toBe('Carrier');
    for (let col = 0; col < 5; col++) {
      expect(board.cells[0][col].ship?.name).toBe('Carrier');
    }
  });

  it('places a ship vertically', () => {
    const board = placeShip(createEmptyBoard(), 'Battleship', { row: 2, col: 3 }, 'vertical');
    expect(board.ships[0].name).toBe('Battleship');
    for (let row = 2; row < 6; row++) {
      expect(board.cells[row][3].ship?.name).toBe('Battleship');
    }
  });

  it('does not allow placement out of bounds', () => {
    const board = createEmptyBoard();
    expect(canPlaceShip(board, 'Carrier', { row: 0, col: 6 }, 'horizontal')).toBe(false);
    expect(canPlaceShip(board, 'Battleship', { row: 7, col: 0 }, 'vertical')).toBe(false);
  });

  it('does not allow overlapping ships', () => {
    const board = placeShip(createEmptyBoard(), 'Carrier', { row: 0, col: 0 }, 'horizontal');
    expect(canPlaceShip(board, 'Battleship', { row: 0, col: 2 }, 'vertical')).toBe(false);
  });

  it('lists unplaced ship names', () => {
    let board = createEmptyBoard();
    expect(getUnplacedShipNames(board)).toEqual([
      'Carrier',
      'Battleship',
      'Cruiser',
      'Submarine',
      'Destroyer',
    ]);
    board = placeShip(board, 'Carrier', { row: 0, col: 0 }, 'horizontal');
    expect(getUnplacedShipNames(board)).not.toContain('Carrier');
  });

  it('removes a placed ship', () => {
    const board = placeShip(createEmptyBoard(), 'Destroyer', { row: 5, col: 5 }, 'horizontal');
    const removed = removeShip(board, 'Destroyer');
    expect(removed.ships).toHaveLength(0);
    expect(removed.cells[5][5].ship).toBeNull();
    expect(removed.cells[5][6].ship).toBeNull();
  });

  it('records a miss', () => {
    const board = createEmptyBoard();
    const { board: next, result } = fireAt(board, 5, 5);
    expect(result.ship).toBeNull();
    expect(result.sunk).toBe(false);
    expect(next.cells[5][5].state).toBe('miss');
  });

  it('records a hit and a sunk ship', () => {
    let board = placeShip(createEmptyBoard(), 'Destroyer', { row: 5, col: 5 }, 'horizontal');
    const { board: afterFirst, result: first } = fireAt(board, 5, 5);
    expect(first.ship?.name).toBe('Destroyer');
    expect(first.sunk).toBe(false);
    expect(afterFirst.cells[5][5].state).toBe('hit');

    const { board: afterSecond, result: second } = fireAt(afterFirst, 5, 6);
    expect(second.ship?.name).toBe('Destroyer');
    expect(second.sunk).toBe(true);
    expect(afterSecond.cells[5][6].state).toBe('hit');
    expect(afterSecond.ships[0].sunk).toBe(true);
  });

  it('does not allow firing the same cell twice', () => {
    let board = createEmptyBoard();
    board = fireAt(board, 5, 5).board;
    const { result } = fireAt(board, 5, 5);
    expect(result.alreadyFired).toBe(true);
  });

  it('detects a fully sunk fleet', () => {
    let board = placeShip(createEmptyBoard(), 'Destroyer', { row: 0, col: 0 }, 'horizontal');
    board = fireAt(board, 0, 0).board;
    expect(isFleetSunk(board)).toBe(false);
    board = fireAt(board, 0, 1).board;
    expect(isFleetSunk(board)).toBe(true);
  });

  it('randomizes a complete legal fleet', () => {
    for (let i = 0; i < 20; i++) {
      const board = randomizeFleet();
      expect(board.ships).toHaveLength(5);
      for (const ship of board.ships) {
        expect(ship.positions.length).toBe(ship.length);
        for (const pos of ship.positions) {
          expect(pos.row).toBeGreaterThanOrEqual(0);
          expect(pos.row).toBeLessThan(10);
          expect(pos.col).toBeGreaterThanOrEqual(0);
          expect(pos.col).toBeLessThan(10);
        }
      }

      const occupied = new Set<string>();
      for (const ship of board.ships) {
        for (const pos of ship.positions) {
          const key = `${pos.row},${pos.col}`;
          expect(occupied.has(key)).toBe(false);
          occupied.add(key);
        }
      }
    }
  });
});
