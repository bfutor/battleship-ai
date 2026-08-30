import { useEffect, useRef, useState } from 'react';
import { BoardGrid } from './components/Board';
import './App.css';
import type { Board, Orientation, Position, ShipName } from './logic/types';
import { SHIPS } from './logic/types';
import {
  canPlaceShip,
  createEmptyBoard,
  fireAt,
  getShipDefinition,
  getUnplacedShipNames,
  isFleetSunk,
  placeShip,
  randomizeFleet,
  removeShip,
} from './logic/board';
import { aiFire, createAIState, type AIState } from './logic/ai';

const ROW_LABELS = 'ABCDEFGHIJ'.split('');

function formatPosition(pos: Position): string {
  return `${ROW_LABELS[pos.row]}${pos.col + 1}`;
}

type Phase = 'setup' | 'player' | 'ai' | 'won' | 'lost';

function App() {
  const [phase, setPhase] = useState<Phase>('setup');
  const [playerBoard, setPlayerBoard] = useState<Board>(() => createEmptyBoard());
  const [enemyBoard, setEnemyBoard] = useState<Board>(() => randomizeFleet());
  const [aiState, setAIState] = useState<AIState>(() => createAIState());

  const [selectedShip, setSelectedShip] = useState<ShipName | null>(null);
  const [orientation, setOrientation] = useState<Orientation>('horizontal');
  const [hoverCell, setHoverCell] = useState<Position | null>(null);
  const [message, setMessage] = useState<string>('Place your fleet');
  const [sunkMessage, setSunkMessage] = useState<string>('');
  const [moves, setMoves] = useState(0);
  const [rankings, setRankings] = useState<{ moves: number; date: string }[]>([]);

  const playerBoardRef = useRef(playerBoard);
  const aiStateRef = useRef(aiState);
  const firingRef = useRef(false);

  playerBoardRef.current = playerBoard;
  aiStateRef.current = aiState;

  const unplacedShips = getUnplacedShipNames(playerBoard);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('battleship-rankings');
      if (saved) setRankings(JSON.parse(saved));
    } catch {
      // ignore malformed localStorage
    }
  }, []);

  useEffect(() => {
    if (phase !== 'ai') return;

    setMessage('AI is firing...');
    const timeout = setTimeout(() => {
      const currentBoard = playerBoardRef.current;
      const currentAI = aiStateRef.current;

      const { move, newState } = aiFire(currentBoard, currentAI);
      const { board: nextBoard, result: fireResult } = fireAt(
        currentBoard,
        move.row,
        move.col
      );

      setAIState(newState);
      setPlayerBoard(nextBoard);

      let msg = `AI fired at ${formatPosition(move)} — `;
      if (fireResult.ship) {
        msg += 'hit';
        if (fireResult.sunk) {
          msg += ` and sunk your ${fireResult.ship.name}!`;
          setSunkMessage(`Your ${fireResult.ship.name} was sunk`);
        } else {
          msg += '!';
          setSunkMessage('');
        }
      } else {
        msg += 'miss.';
        setSunkMessage('');
      }

      if (isFleetSunk(nextBoard)) {
        setMessage(`${msg} AI wins.`);
        setPhase('lost');
      } else {
        setMessage(`${msg} Your turn.`);
        setPhase('player');
      }
      firingRef.current = false;
    }, 900);

    return () => {
      clearTimeout(timeout);
      firingRef.current = false;
    };
  }, [phase]);

  function resetGame() {
    setPhase('setup');
    setPlayerBoard(createEmptyBoard());
    setEnemyBoard(randomizeFleet());
    setAIState(createAIState());
    setSelectedShip(null);
    setOrientation('horizontal');
    setHoverCell(null);
    setMessage('Place your fleet');
    setSunkMessage('');
    setMoves(0);
    firingRef.current = false;
  }

  function saveRanking(finalMoves: number) {
    const entry = { moves: finalMoves, date: new Date().toLocaleDateString() };
    const next = [...rankings, entry].sort((a, b) => a.moves - b.moves);
    setRankings(next);
    try {
      localStorage.setItem('battleship-rankings', JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }

  function getScore(board: Board) {
    let hits = 0;
    let misses = 0;
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        const cell = board.cells[row][col];
        if (cell.state === 'hit' && cell.ship) hits++;
        else if (cell.state === 'miss') misses++;
      }
    }
    return { hits, misses, shots: hits + misses };
  }

  function randomizePlayerFleet() {
    const newBoard = randomizeFleet();
    setPlayerBoard(newBoard);
    setSelectedShip(null);
    setHoverCell(null);
    setMessage('All ships placed. Start the game when ready.');
  }

  function clearPlayerFleet() {
    setPlayerBoard(createEmptyBoard());
    setSelectedShip(null);
    setHoverCell(null);
    setMessage('Place your fleet');
    setSunkMessage('');
  }

  function startGame() {
    if (unplacedShips.length > 0) return;
    setPhase('player');
    setMessage('Your turn — fire at the enemy fleet');
    setSelectedShip(null);
    setHoverCell(null);
  }

  function toggleOrientation() {
    setOrientation((prev) => (prev === 'horizontal' ? 'vertical' : 'horizontal'));
  }

  function handleSetupCellHover(row: number, col: number) {
    if (phase !== 'setup' || !selectedShip) return;
    setHoverCell({ row, col });
  }

  function handleSetupCellLeave() {
    setHoverCell(null);
  }

  function handleSetupCellClick(row: number, col: number) {
    if (phase !== 'setup') return;

    const clickedShip = playerBoard.cells[row][col].ship;
    if (clickedShip) {
      const nextBoard = removeShip(playerBoard, clickedShip.name);
      setPlayerBoard(nextBoard);
      setSelectedShip(clickedShip.name);
      setHoverCell(null);
      setMessage('Place your fleet');
      return;
    }

    if (!selectedShip) return;

    if (canPlaceShip(playerBoard, selectedShip, { row, col }, orientation)) {
      const nextBoard = placeShip(playerBoard, selectedShip, { row, col }, orientation);
      setPlayerBoard(nextBoard);
      setHoverCell(null);

      const remaining = getUnplacedShipNames(nextBoard);
      if (remaining.length > 0) {
        setSelectedShip(remaining[0]);
      } else {
        setSelectedShip(null);
        setMessage('All ships placed. Start the game when ready.');
      }
    }
  }

  function handleRemoveShip(name: ShipName) {
    const nextBoard = removeShip(playerBoard, name);
    setPlayerBoard(nextBoard);
    setSelectedShip(name);
  }

  function handleEnemyCellClick(row: number, col: number) {
    if (phase !== 'player' || firingRef.current) return;

    const cell = enemyBoard.cells[row][col];
    if (cell.state !== 'empty') return;

    firingRef.current = true;
    const nextMoves = moves + 1;
    setMoves(nextMoves);
    const { board: nextBoard, result: fireResult } = fireAt(enemyBoard, row, col);
    setEnemyBoard(nextBoard);

    let msg = `You fired at ${formatPosition({ row, col })} — `;
    if (fireResult.ship) {
      msg += 'hit';
      if (fireResult.sunk) {
        msg += ` and sunk the enemy ${fireResult.ship.name}!`;
        setSunkMessage(`Enemy ${fireResult.ship.name} sunk`);
      } else {
        msg += '!';
        setSunkMessage('');
      }
    } else {
      msg += 'miss.';
      setSunkMessage('');
    }

    if (isFleetSunk(nextBoard)) {
      setMessage(`${msg} You win!`);
      setPhase('won');
      firingRef.current = false;
      saveRanking(nextMoves);
    } else {
      setMessage(`${msg} AI's turn...`);
      setPhase('ai');
    }
  }

  function getPreviewCells(): { cells: Position[]; valid: boolean } {
    if (phase !== 'setup' || !selectedShip || !hoverCell) {
      return { cells: [], valid: true };
    }

    const { length } = getShipDefinition(selectedShip);
    const cells = Array.from({ length }, (_, i) =>
      orientation === 'horizontal'
        ? { row: hoverCell.row, col: hoverCell.col + i }
        : { row: hoverCell.row + i, col: hoverCell.col }
    );
    const valid = canPlaceShip(playerBoard, selectedShip, hoverCell, orientation);
    return { cells, valid };
  }

  const preview = getPreviewCells();

  function renderPlacementPanel() {
    return (
      <div className="panel">
        <h2 className="panel-title">Ship Placement</h2>
        <p className="panel-instruction">
          Select a ship, then click your board to place it.
        </p>

        <div className="ship-list">
          {SHIPS.map((ship) => {
            const placed = playerBoard.ships.some((s) => s.name === ship.name);
            return (
              <button
                key={ship.name}
                type="button"
                className={`ship-item ${selectedShip === ship.name ? 'selected' : ''} ${placed ? 'placed' : ''}`}
                aria-label={`${ship.name} (${ship.length})${placed ? ' — placed' : ''}`}
                onClick={() =>
                  placed ? handleRemoveShip(ship.name) : setSelectedShip(ship.name)
                }
                disabled={phase !== 'setup'}
              >
                <span className="ship-name">{ship.name}</span>
                <span className="ship-length">{ship.length}</span>
                {placed && <span className="ship-status">Placed</span>}
              </button>
            );
          })}
        </div>

        <div className="panel-actions">
          <button type="button" className="btn btn-secondary" onClick={toggleOrientation}>
            Rotate ({orientation === 'horizontal' ? 'Horizontal' : 'Vertical'})
          </button>
          <button type="button" className="btn btn-secondary" onClick={randomizePlayerFleet}>
            Randomize Fleet
          </button>
          <button type="button" className="btn btn-danger" onClick={clearPlayerFleet}>
            Clear
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={startGame}
            disabled={unplacedShips.length > 0}
          >
            Start Game
          </button>
        </div>

        <details className="help">
          <summary>How to Play</summary>
          <ol>
            <li>Select a ship and tap a cell on Your Fleet to place it.</li>
            <li>Use <strong>Rotate</strong> to switch direction, or <strong>Randomize Fleet</strong> for instant setup.</li>
            <li>Click <strong>Start Game</strong>.</li>
            <li>Tap cells on the Enemy Fleet to fire. Red X = hit, dot = miss.</li>
            <li>Sink every enemy ship before the AI sinks yours.</li>
          </ol>
        </details>

        <div className="ranking">
          <h3 className="ranking-title">Best Wins</h3>
          {rankings.length === 0 ? (
            <p className="ranking-empty">No wins yet — sink the enemy fleet to set a record.</p>
          ) : (
            <ol className="ranking-list">
              {rankings.map((r, i) => (
                <li key={i}>
                  <span>#{i + 1}</span>
                  <span className="ranking-moves">{r.moves} moves</span>
                  <span className="ranking-date">{r.date}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Battleship</h1>
        <p className="status">{message}</p>
        {sunkMessage && <p className="sunk-message">{sunkMessage}</p>}
      </header>

      <main className="game">
        <section className="board-section">
          <BoardGrid
            board={playerBoard}
            label="Your Fleet"
            isPlayerView
            previewCells={preview.cells}
            previewValid={preview.valid}
            onCellClick={phase === 'setup' ? handleSetupCellClick : undefined}
            onCellHover={phase === 'setup' ? handleSetupCellHover : undefined}
            onCellLeave={handleSetupCellLeave}
          />
        </section>

        <section className="board-section">
          {phase === 'setup' ? (
            renderPlacementPanel()
          ) : (
            <div className="enemy-section">
              <BoardGrid
                board={enemyBoard}
                label="Enemy Fleet"
                isPlayerView={false}
                disabled={phase !== 'player'}
                onCellClick={handleEnemyCellClick}
              />
              <div className="panel game-panel">
                <div className="scoreboard">
                  <div className="score-item">
                    <span>Hits</span>
                    <strong>{getScore(enemyBoard).hits}</strong>
                  </div>
                  <div className="score-item">
                    <span>Misses</span>
                    <strong>{getScore(enemyBoard).misses}</strong>
                  </div>
                  <div className="score-item">
                    <span>Moves</span>
                    <strong>{moves}</strong>
                  </div>
                </div>
                <h3 className="fleet-status-title">Enemy Ships</h3>
                <ul className="fleet-list">
                  {enemyBoard.ships.map((ship) => (
                    <li key={ship.name} className={ship.sunk ? 'sunk' : ''}>
                      {ship.name} ({ship.length})
                      {ship.sunk && ' — Sunk'}
                    </li>
                  ))}
                </ul>
                {(phase === 'won' || phase === 'lost') && (
                  <button
                    type="button"
                    className="btn btn-primary play-again"
                    onClick={resetGame}
                  >
                    Play Again
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      </main>

      {phase === 'setup' && (
        <div className="mobile-actions">
          <button type="button" className="btn btn-secondary" onClick={toggleOrientation}>
            Rotate
          </button>
          <button type="button" className="btn btn-secondary" onClick={randomizePlayerFleet}>
            Randomize
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={startGame}
            disabled={unplacedShips.length > 0}
          >
            Start Game
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
