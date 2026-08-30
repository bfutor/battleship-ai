import type { Board, Position } from './types';
import { BOARD_SIZE } from './types';
import { isInBounds } from './board';

// AI state is kept pure so it can live inside React state without side effects.
export interface AIState {
  /** Cells the AI has already fired at. */
  shots: Set<string>;
  /** Hits that have not yet been associated with a sunk ship. */
  unresolvedHits: Position[];
  /** Queue of high-priority cells to try next. */
  targetQueue: Position[];
}

export function createAIState(): AIState {
  return { shots: new Set(), unresolvedHits: [], targetQueue: [] };
}

function key(pos: Position): string {
  return `${pos.row},${pos.col}`;
}

const ORTHOGONAL: Position[] = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
];

function getNeighbors(pos: Position): Position[] {
  return ORTHOGONAL.map((delta) => ({ row: pos.row + delta.row, col: pos.col + delta.col }))
    .filter(isInBounds);
}

function getLineExtensions(hits: Position[]): Position[] {
  if (hits.length === 0) return [];

  // If hits are aligned, try extending the line in both directions.
  const rows = hits.map((h) => h.row);
  const cols = hits.map((h) => h.col);
  const sameRow = rows.every((r) => r === rows[0]);
  const sameCol = cols.every((c) => c === cols[0]);

  if (sameRow) {
    const sorted = [...hits].sort((a, b) => a.col - b.col);
    const row = sorted[0].row;
    return [
      { row, col: sorted[0].col - 1 },
      { row, col: sorted[sorted.length - 1].col + 1 },
    ];
  }

  if (sameCol) {
    const sorted = [...hits].sort((a, b) => a.row - b.row);
    const col = sorted[0].col;
    return [
      { row: sorted[0].row - 1, col },
      { row: sorted[sorted.length - 1].row + 1, col },
    ];
  }

  // Hits aren't in a clean line yet; try extending from each end in plausible directions.
  const candidates: Position[] = [];
  for (const hit of hits) {
    for (const delta of ORTHOGONAL) {
      candidates.push({ row: hit.row + delta.row, col: hit.col + delta.col });
    }
  }
  return candidates;
}

function dedupeAndFilter(positions: Position[], state: AIState): Position[] {
  const seen = new Set<string>();
  const result: Position[] = [];
  for (const pos of positions) {
    const k = key(pos);
    if (isInBounds(pos) && !seen.has(k) && !state.shots.has(k)) {
      seen.add(k);
      result.push(pos);
    }
  }
  return result;
}

function rebuildQueue(state: AIState): Position[] {
  const hits = state.unresolvedHits;
  if (hits.length === 0) return [];

  let candidates: Position[];
  if (hits.length === 1) {
    candidates = getNeighbors(hits[0]);
  } else {
    candidates = getLineExtensions(hits);
  }

  return dedupeAndFilter(candidates, state);
}

export function aiFire(board: Board, state: AIState): { move: Position; newState: AIState; result: 'hit' | 'miss' | 'sunk' } {
  let target: Position;

  // 1. Prioritize finishing a targeted ship.
  const queue = rebuildQueue(state);
  if (queue.length > 0) {
    target = queue[0];
  } else {
    // 2. Hunt mode: pick a random unexplored cell.
    const available: Position[] = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const pos = { row, col };
        if (!state.shots.has(key(pos))) {
          available.push(pos);
        }
      }
    }
    if (available.length === 0) {
      throw new Error('AI has no legal moves left');
    }
    target = available[Math.floor(Math.random() * available.length)];
  }

  const newState = {
    shots: new Set([...state.shots, key(target)]),
    unresolvedHits: [...state.unresolvedHits],
    targetQueue: [],
  };

  const cell = board.cells[target.row][target.col];
  if (cell.state !== 'empty') {
    // Should not happen because the AI tracks shots, but treat as miss.
    return { move: target, newState, result: 'miss' };
  }

  const hasShip = cell.ship !== null;
  if (hasShip) {
    newState.unresolvedHits = [...newState.unresolvedHits, target];

    const ship = cell.ship!;
    // Determine whether this shot will sink the ship.
    // The actual sunk check happens in fireAt, but we can predict it here to update AI state.
    const willSink = ship.hits + 1 === ship.length;
    if (willSink) {
      // Remove all positions of the sunk ship from unresolved hits.
      const sunkPositions = new Set(ship.positions.map(key));
      newState.unresolvedHits = newState.unresolvedHits.filter((h) => !sunkPositions.has(key(h)));
      return { move: target, newState, result: 'sunk' };
    }
    return { move: target, newState, result: 'hit' };
  }

  return { move: target, newState, result: 'miss' };
}
