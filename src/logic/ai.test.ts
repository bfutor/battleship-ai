import { describe, expect, it } from 'vitest';
import { aiFire, createAIState } from './ai';
import { createEmptyBoard, fireAt, placeShip, randomizeFleet } from './board';

describe('AI logic', () => {
  it('fires at a legal, unexplored cell in hunt mode', () => {
    const board = createEmptyBoard();
    const state = createAIState();
    const { move, newState } = aiFire(board, state);
    expect(move.row).toBeGreaterThanOrEqual(0);
    expect(move.row).toBeLessThan(10);
    expect(move.col).toBeGreaterThanOrEqual(0);
    expect(move.col).toBeLessThan(10);
    expect(newState.shots.has(`${move.row},${move.col}`)).toBe(true);
  });

  it('never fires at the same cell twice', () => {
    let board = createEmptyBoard();
    let state = createAIState();

    for (let i = 0; i < 50; i++) {
      const { move, newState } = aiFire(board, state);
      expect(state.shots.has(`${move.row},${move.col}`)).toBe(false);
      state = newState;
      const { board: nextBoard } = fireAt(board, move.row, move.col);
      board = nextBoard;
    }
  });

  it('targets a neighbor after a hit', () => {
    let board = placeShip(createEmptyBoard(), 'Destroyer', { row: 5, col: 5 }, 'horizontal');
    let state = createAIState();

    const { move: firstMove, newState: afterFirst } = aiFire(board, state);
    state = afterFirst;
    // If the first random shot was a hit, the next shot should be adjacent.
    if (board.cells[firstMove.row][firstMove.col].ship) {
      const { move: secondMove } = aiFire(board, state);
      const isAdjacent =
        (Math.abs(secondMove.row - firstMove.row) === 1 && secondMove.col === firstMove.col) ||
        (Math.abs(secondMove.col - firstMove.col) === 1 && secondMove.row === firstMove.row);
      expect(isAdjacent).toBe(true);
    }
  });

  it('transitions back to hunt mode after sinking a ship', () => {
    let board = placeShip(createEmptyBoard(), 'Destroyer', { row: 5, col: 5 }, 'horizontal');
    // Manually set up AI state with a single unresolved hit.
    let state = createAIState();
    const { move, newState, result } = aiFire(board, state);

    if (result === 'hit') {
      const { board: updatedBoard } = fireAt(board, move.row, move.col);
      board = updatedBoard;
      state = newState;

      const { move: secondMove, result: secondResult } = aiFire(board, state);
      expect(state.shots.has(`${secondMove.row},${secondMove.col}`)).toBe(false);

      if (secondResult === 'sunk') {
        const { board: nextBoard } = fireAt(board, secondMove.row, secondMove.col);
        const { move: thirdMove } = aiFire(nextBoard, state);
        // After a sink, the AI should not be constrained to the destroyed ship's neighbors.
        expect(state.shots.has(`${thirdMove.row},${thirdMove.col}`)).toBe(false);
      }
    }
  });

  it('can sink an entire randomized fleet', () => {
    for (let game = 0; game < 10; game++) {
      let board = randomizeFleet();
      let state = createAIState();

      // Play until fleet is sunk.
      while (!board.ships.every((s) => s.sunk)) {
        const { move, newState } = aiFire(board, state);
        const { board: nextBoard } = fireAt(board, move.row, move.col);
        board = nextBoard;
        state = newState;
      }

      expect(board.ships.every((s) => s.sunk)).toBe(true);
    }
  });
});
