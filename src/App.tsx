import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
import {
  applyShotResult,
  buildInviteLink,
  createRoom,
  createSupabaseTransportFactory,
  getSupabaseConfig,
  joinRoom,
  parseRoomIdFromHash,
  toShotResult,
  type MultiplayerRoom,
  type RoomState,
  type TransportFactory,
} from './logic/multiplayer';

const ROW_LABELS = 'ABCDEFGHIJ'.split('');

function formatPosition(pos: Position): string {
  return `${ROW_LABELS[pos.row]}${pos.col + 1}`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type Mode = 'menu' | 'ai' | 'online';
type Phase = 'setup' | 'player' | 'opponent' | 'won' | 'lost';

interface RankingEntry {
  moves: number;
  date: string;
}

interface AppProps {
  transportFactory?: TransportFactory;
}

function defaultTransportFactory(): TransportFactory | null {
  const config = getSupabaseConfig(import.meta.env);
  return config ? createSupabaseTransportFactory(config.url, config.anonKey) : null;
}

function getScore(board: Board) {
  let hits = 0;
  let misses = 0;
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      const state = board.cells[row][col].state;
      if (state === 'hit') hits++;
      else if (state === 'miss') misses++;
    }
  }
  return { hits, misses, shots: hits + misses };
}

interface FleetEntry {
  name: ShipName;
  length: number;
  hits: number;
  sunk: boolean;
}

function describeFleet(board: Board): FleetEntry[] {
  return SHIPS.map((def) => {
    const ship = board.ships.find((s) => s.name === def.name);
    return {
      name: def.name,
      length: def.length,
      hits: ship?.hits ?? 0,
      sunk: ship?.sunk ?? false,
    };
  });
}

function FleetStatus({ title, fleet, hideHits }: { title: string; fleet: FleetEntry[]; hideHits?: boolean }) {
  const remaining = fleet.filter((s) => !s.sunk).length;
  return (
    <div className="fleet-status">
      <div className="fleet-status-header">
        <h3 className="fleet-status-title">{title}</h3>
        <span className="fleet-remaining">
          {remaining}/{fleet.length} afloat
        </span>
      </div>
      <ul className="fleet-list">
        {fleet.map((ship) => (
          <li
            key={ship.name}
            className={`fleet-ship${ship.sunk ? ' sunk' : ''}`}
            aria-label={`${ship.name} (${ship.length})${ship.sunk ? ' — sunk' : ''}`}
          >
            <span className="fleet-ship-name">{ship.name}</span>
            <span className="ship-silhouette" aria-hidden="true">
              {Array.from({ length: ship.length }, (_, i) => (
                <span
                  key={i}
                  className={`ship-segment${!hideHits && i < ship.hits ? ' damaged' : ''}`}
                />
              ))}
            </span>
            <span className="fleet-ship-state">{ship.sunk ? 'Sunk' : `${ship.length}`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HowToPlay({ open }: { open?: boolean }) {
  return (
    <details className="help" open={open}>
      <summary>How to Play</summary>
      <h4>Setting up</h4>
      <ol>
        <li>Select a ship and tap a cell on Your Fleet to place it. Tap a placed ship to move it.</li>
        <li>
          Use <strong>Rotate</strong> to switch direction, or <strong>Randomize Fleet</strong> for instant
          setup.
        </li>
      </ol>
      <h4>Play vs AI</h4>
      <ol>
        <li>
          Click <strong>Start Game</strong>. You always fire first.
        </li>
        <li>Tap cells on the Enemy Fleet to fire. Turns alternate with the AI automatically.</li>
        <li>Sink all five enemy ships before the AI sinks yours to set a Best Wins record.</li>
      </ol>
      <h4>Play a Friend</h4>
      <ol>
        <li>
          Choose <strong>Play a Friend</strong>, then copy the invite link and send it to your opponent.
        </li>
        <li>Both players place their fleets privately and press <strong>Ready</strong>.</li>
        <li>The host fires first; turns alternate in real time. Only shot results are shared — never ship positions.</li>
      </ol>
      <p className="help-legend">
        <span className="legend-item">
          <span className="legend-swatch legend-hit" /> Hit
        </span>
        <span className="legend-item">
          <span className="legend-swatch legend-sunk" /> Sunk
        </span>
        <span className="legend-item">
          <span className="legend-swatch legend-miss" /> Miss
        </span>
        <span className="legend-item">
          <span className="legend-swatch legend-ship" /> Your ship
        </span>
      </p>
    </details>
  );
}

function App({ transportFactory }: AppProps) {
  const factory = useMemo<TransportFactory | null>(
    () => transportFactory ?? defaultTransportFactory(),
    [transportFactory]
  );
  const onlineAvailable = factory !== null;

  const [mode, setMode] = useState<Mode>('menu');
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
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [turnSeconds, setTurnSeconds] = useState(0);
  const [showResult, setShowResult] = useState(false);

  const [room, setRoom] = useState<MultiplayerRoom | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [pendingShot, setPendingShot] = useState<Position | null>(null);
  const [copied, setCopied] = useState(false);

  const playerBoardRef = useRef(playerBoard);
  const aiStateRef = useRef(aiState);
  const firingRef = useRef(false);
  const roomRef = useRef<MultiplayerRoom | null>(null);
  const activeRoomIdRef = useRef<string | null>(null);
  const phaseRef = useRef(phase);

  playerBoardRef.current = playerBoard;
  aiStateRef.current = aiState;
  roomRef.current = room;
  phaseRef.current = phase;

  const unplacedShips = getUnplacedShipNames(playerBoard);
  const isOnline = mode === 'online';
  const localReady = roomState?.localReady ?? false;
  const opponentReady = roomState?.opponentReady ?? false;
  const connection = roomState?.connection ?? 'connecting';
  const opponentName = isOnline ? 'Opponent' : 'AI';
  const gameOver = phase === 'won' || phase === 'lost';
  const inBattle = phase === 'player' || phase === 'opponent';

  useEffect(() => {
    try {
      const saved = localStorage.getItem('battleship-rankings');
      if (saved) setRankings(JSON.parse(saved));
    } catch {
      // ignore malformed localStorage
    }
  }, []);

  // Turn timer.
  useEffect(() => {
    if (!inBattle) return;
    setTurnSeconds(0);
    const interval = setInterval(() => setTurnSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [phase, inBattle]);

  useEffect(() => {
    if (gameOver) setShowResult(true);
  }, [gameOver]);

  // AI opponent turn.
  useEffect(() => {
    if (mode !== 'ai' || phase !== 'opponent') return;

    setMessage('AI is firing...');
    const timeout = setTimeout(() => {
      const currentBoard = playerBoardRef.current;
      const currentAI = aiStateRef.current;

      const { move, newState } = aiFire(currentBoard, currentAI);
      const { board: nextBoard, result: fireResult } = fireAt(currentBoard, move.row, move.col);

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
  }, [mode, phase]);

  const resetBoards = useCallback((withEnemyFleet: boolean) => {
    setPhase('setup');
    setPlayerBoard(createEmptyBoard());
    setEnemyBoard(withEnemyFleet ? randomizeFleet() : createEmptyBoard());
    setAIState(createAIState());
    setSelectedShip(null);
    setOrientation('horizontal');
    setHoverCell(null);
    setMessage('Place your fleet');
    setSunkMessage('');
    setMoves(0);
    setPendingShot(null);
    setShowResult(false);
    firingRef.current = false;
  }, []);

  const leaveRoom = useCallback(() => {
    const current = roomRef.current;
    if (current) void current.leave();
    activeRoomIdRef.current = null;
    setRoom(null);
    setRoomState(null);
  }, []);

  const openRoom = useCallback(
    (nextRoom: MultiplayerRoom) => {
      const current = roomRef.current;
      if (current) void current.leave();
      activeRoomIdRef.current = nextRoom.getState().roomId;
      roomRef.current = nextRoom;
      setRoom(nextRoom);
      setRoomState(nextRoom.getState());
      setMode('online');
      resetBoards(false);
      setCopied(false);
      const hash = `#/game/${nextRoom.getState().roomId}`;
      if (window.location.hash !== hash) window.location.hash = hash;
    },
    [resetBoards]
  );

  const startAiGame = useCallback(() => {
    leaveRoom();
    setMode('ai');
    resetBoards(true);
    if (window.location.hash) history.replaceState(null, '', window.location.pathname);
  }, [leaveRoom, resetBoards]);

  const goToMenu = useCallback(() => {
    leaveRoom();
    setMode('menu');
    resetBoards(true);
    if (window.location.hash) history.replaceState(null, '', window.location.pathname);
  }, [leaveRoom, resetBoards]);

  const hostGame = useCallback(() => {
    if (!factory) return;
    openRoom(createRoom(factory));
  }, [factory, openRoom]);

  // Hash routing: /#/game/<roomId> auto-joins that room.
  useEffect(() => {
    const handleHash = () => {
      const roomId = parseRoomIdFromHash(window.location.hash);
      if (roomId) {
        if (!factory) {
          setMode('online');
          return;
        }
        if (activeRoomIdRef.current !== roomId) openRoom(joinRoom(roomId, factory));
      } else if (activeRoomIdRef.current) {
        goToMenu();
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [factory, openRoom, goToMenu]);

  useEffect(() => {
    return () => {
      roomRef.current?.leave();
    };
  }, []);

  // Wire the active room into game state.
  useEffect(() => {
    if (!room) return;

    const unsubscribeState = room.subscribe(setRoomState);
    const unsubscribeEvents = room.onEvent((event) => {
      switch (event.type) {
        case 'opponent-joined':
          setMessage(
            phaseRef.current === 'setup' ? 'Opponent connected — place your fleet and press Ready' : 'Opponent reconnected'
          );
          break;
        case 'opponent-ready':
          if (phaseRef.current === 'setup') {
            setMessage(
              room.getState().localReady
                ? 'Both fleets are ready'
                : 'Opponent is ready — place your fleet and press Ready'
            );
          }
          break;
        case 'opponent-shot': {
          const currentBoard = playerBoardRef.current;
          const { board: nextBoard, result } = fireAt(currentBoard, event.row, event.col);
          setPlayerBoard(nextBoard);
          const fleetSunk = isFleetSunk(nextBoard);
          void room.reportShotResult(toShotResult(result, event.row, event.col, fleetSunk));

          let msg = `Opponent fired at ${formatPosition(event)} — `;
          if (result.ship) {
            msg += result.sunk ? `hit and sunk your ${result.ship.name}!` : 'hit!';
            setSunkMessage(result.sunk ? `Your ${result.ship.name} was sunk` : '');
          } else {
            msg += 'miss.';
            setSunkMessage('');
          }
          if (fleetSunk) {
            setMessage(`${msg} Opponent wins.`);
            setPhase('lost');
          } else {
            setMessage(`${msg} Your turn.`);
            setPhase('player');
          }
          firingRef.current = false;
          break;
        }
        case 'shot-result': {
          const { result } = event;
          setEnemyBoard((board) => applyShotResult(board, result));
          setPendingShot(null);
          let msg = `You fired at ${formatPosition(result)} — `;
          if (result.hit) {
            msg += result.sunk ? `hit and sunk the enemy ${result.shipName}!` : 'hit!';
            setSunkMessage(result.sunk ? `Enemy ${result.shipName} sunk` : '');
          } else {
            msg += 'miss.';
            setSunkMessage('');
          }
          if (result.fleetSunk) {
            setMessage(`${msg} You win!`);
            setPhase('won');
          } else {
            setMessage(`${msg} Opponent's turn...`);
            setPhase('opponent');
          }
          firingRef.current = false;
          break;
        }
        case 'opponent-left':
          setSunkMessage('');
          setMessage(
            phaseRef.current === 'won' || phaseRef.current === 'lost'
              ? 'Opponent left the game'
              : 'Opponent disconnected — waiting for them to rejoin'
          );
          break;
      }
    });

    return () => {
      unsubscribeState();
      unsubscribeEvents();
    };
  }, [room]);

  // Start the online match once both players are ready.
  useEffect(() => {
    if (!isOnline || !roomState || phase !== 'setup') return;
    if (roomState.localReady && roomState.opponentReady) {
      const myTurn = roomState.turn === roomState.role;
      setPhase(myTurn ? 'player' : 'opponent');
      setMessage(myTurn ? 'Both fleets ready — your turn, fire!' : "Both fleets ready — opponent's turn");
    }
  }, [isOnline, roomState, phase]);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

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

  function randomizePlayerFleet() {
    if (localReady) return;
    setPlayerBoard(randomizeFleet());
    setSelectedShip(null);
    setHoverCell(null);
    setMessage(isOnline ? 'All ships placed. Press Ready when set.' : 'All ships placed. Start the game when ready.');
  }

  function clearPlayerFleet() {
    if (localReady) return;
    setPlayerBoard(createEmptyBoard());
    setSelectedShip(null);
    setHoverCell(null);
    setMessage('Place your fleet');
    setSunkMessage('');
  }

  function startGame() {
    if (unplacedShips.length > 0) return;
    setSelectedShip(null);
    setHoverCell(null);
    if (isOnline) {
      if (!room || localReady) return;
      void room.setReady();
      setMessage(
        opponentReady ? 'Both fleets are ready' : 'Fleet locked in — waiting for opponent to place ships'
      );
      return;
    }
    setPhase('player');
    setMessage('Your turn — fire at the enemy fleet');
  }

  function playAgain() {
    if (isOnline) {
      hostGame();
    } else {
      resetBoards(true);
    }
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
    if (phase !== 'setup' || localReady) return;

    const clickedShip = playerBoard.cells[row][col].ship;
    if (clickedShip) {
      setPlayerBoard(removeShip(playerBoard, clickedShip.name));
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
        setMessage(isOnline ? 'All ships placed. Press Ready when set.' : 'All ships placed. Start the game when ready.');
      }
    }
  }

  function handleRemoveShip(name: ShipName) {
    if (localReady) return;
    setPlayerBoard(removeShip(playerBoard, name));
    setSelectedShip(name);
  }

  function handleEnemyCellClick(row: number, col: number) {
    if (phase !== 'player' || firingRef.current) return;

    const cell = enemyBoard.cells[row][col];
    if (cell.state !== 'empty') return;

    if (isOnline) {
      if (!room || connection !== 'connected' || pendingShot) return;
      firingRef.current = true;
      setMoves((m) => m + 1);
      setPendingShot({ row, col });
      setMessage(`Firing at ${formatPosition({ row, col })}...`);
      room.fire(row, col).catch(() => {
        setPendingShot(null);
        firingRef.current = false;
        setMessage('Shot failed to send — try again');
      });
      return;
    }

    firingRef.current = true;
    const nextMoves = moves + 1;
    setMoves(nextMoves);
    const { board: nextBoard, result: fireResult } = fireAt(enemyBoard, row, col);
    setEnemyBoard(nextBoard);

    let msg = `You fired at ${formatPosition({ row, col })} — `;
    if (fireResult.ship) {
      msg += fireResult.sunk ? `hit and sunk the enemy ${fireResult.ship.name}!` : 'hit!';
      setSunkMessage(fireResult.sunk ? `Enemy ${fireResult.ship.name} sunk` : '');
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
      setPhase('opponent');
    }
  }

  async function copyInviteLink() {
    if (!roomState) return;
    const link = buildInviteLink(roomState.roomId, window.location.origin, window.location.pathname);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      window.prompt('Copy this invite link', link);
    }
  }

  function getPreviewCells(): { cells: Position[]; valid: boolean } {
    if (phase !== 'setup' || !selectedShip || !hoverCell || localReady) {
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
  const inviteLink = roomState
    ? buildInviteLink(roomState.roomId, window.location.origin, window.location.pathname)
    : '';

  function connectionLabel(): { text: string; tone: 'ok' | 'warn' | 'bad' } {
    switch (connection) {
      case 'connected':
        return { text: 'Opponent connected', tone: 'ok' };
      case 'waiting':
        return { text: 'Waiting for opponent to join…', tone: 'warn' };
      case 'connecting':
        return { text: 'Connecting…', tone: 'warn' };
      case 'opponent-left':
        return { text: 'Opponent disconnected', tone: 'bad' };
      case 'room-full':
        return { text: 'This room already has two players', tone: 'bad' };
      case 'error':
        return { text: 'Connection error — check your network', tone: 'bad' };
    }
  }

  function renderModeMenu() {
    return (
      <div className="menu">
        <div className="menu-cards">
          <button type="button" className="mode-card" onClick={startAiGame}>
            <span className="mode-icon" aria-hidden="true">
              ⚓
            </span>
            <span className="mode-title">Play vs AI</span>
            <span className="mode-desc">Face a hunt-and-target AI opponent. Set a Best Wins record.</span>
          </button>
          <button
            type="button"
            className="mode-card"
            onClick={hostGame}
            disabled={!onlineAvailable}
          >
            <span className="mode-icon" aria-hidden="true">
              🔗
            </span>
            <span className="mode-title">
              Play a Friend
              {!onlineAvailable && <span className="mode-badge">Coming soon</span>}
            </span>
            <span className="mode-desc">
              {onlineAvailable
                ? 'Create a private room and share an invite link for real-time play.'
                : 'Invite a friend with a shareable link and battle in real time.'}
            </span>
          </button>
        </div>
        <div className="panel menu-panel">
          <HowToPlay open />
          {renderRanking()}
        </div>
      </div>
    );
  }

  function renderRanking() {
    return (
      <div className="ranking">
        <h3 className="ranking-title">Best Wins vs AI</h3>
        {rankings.length === 0 ? (
          <p className="ranking-empty">No wins yet — sink the enemy fleet to set a record.</p>
        ) : (
          <ol className="ranking-list">
            {rankings.slice(0, 5).map((r, i) => (
              <li key={i}>
                <span className="ranking-rank">#{i + 1}</span>
                <span className="ranking-moves">{r.moves} moves</span>
                <span className="ranking-date">{r.date}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  }

  function renderInviteCard() {
    if (!roomState) return null;
    const status = connectionLabel();
    return (
      <div className="invite-card">
        <div className="invite-header">
          <h3 className="invite-title">
            {roomState.role === 'host' ? 'Share this link to invite a friend' : 'Private room'}
          </h3>
          <span className={`connection-pill tone-${status.tone}`}>
            <span className="connection-dot" aria-hidden="true" />
            {status.text}
          </span>
        </div>
        {roomState.role === 'host' && (
          <div className="invite-row">
            <input
              className="invite-link"
              type="text"
              readOnly
              value={inviteLink}
              aria-label="Invite link"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button type="button" className="btn btn-primary" onClick={copyInviteLink}>
              {copied ? 'Copied!' : 'Copy invite link'}
            </button>
          </div>
        )}
        <p className="invite-hint">
          {roomState.role === 'host'
            ? 'Your friend opens the link, places their fleet, and the match starts when you are both ready.'
            : 'You joined via an invite link. Place your fleet and press Ready.'}
        </p>
      </div>
    );
  }

  function renderReadyState() {
    if (!isOnline) return null;
    return (
      <ul className="ready-list" aria-label="Fleet readiness">
        <li className={localReady ? 'ready' : ''}>
          <span className="ready-dot" aria-hidden="true" />
          You: {localReady ? 'Ready' : 'Placing ships'}
        </li>
        <li className={opponentReady ? 'ready' : ''}>
          <span className="ready-dot" aria-hidden="true" />
          Opponent:{' '}
          {connection !== 'connected' && connection !== 'opponent-left'
            ? 'Not joined yet'
            : opponentReady
              ? 'Ready'
              : 'Placing ships'}
        </li>
      </ul>
    );
  }

  const canStart = unplacedShips.length === 0 && !localReady;
  const startLabel = isOnline ? (localReady ? 'Waiting for opponent…' : 'Ready') : 'Start Game';

  function renderPlacementPanel() {
    return (
      <div className="panel">
        {isOnline && renderInviteCard()}
        <h2 className="panel-title">Ship Placement</h2>
        <p className="panel-instruction">
          {localReady
            ? 'Your fleet is locked in. Waiting for your opponent to place ships…'
            : 'Select a ship, then click your board to place it.'}
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
                onClick={() => (placed ? handleRemoveShip(ship.name) : setSelectedShip(ship.name))}
                disabled={phase !== 'setup' || localReady}
              >
                <span className="ship-name">{ship.name}</span>
                <span className="ship-silhouette" aria-hidden="true">
                  {Array.from({ length: ship.length }, (_, i) => (
                    <span key={i} className="ship-segment" />
                  ))}
                </span>
                <span className="ship-length">{ship.length}</span>
                {placed && <span className="ship-status">Placed</span>}
              </button>
            );
          })}
        </div>

        {renderReadyState()}

        <div className="panel-actions">
          <div className="panel-actions-row">
            <button type="button" className="btn btn-secondary" onClick={toggleOrientation} disabled={localReady}>
              Rotate ({orientation === 'horizontal' ? 'Horizontal' : 'Vertical'})
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={randomizePlayerFleet}
              disabled={localReady}
            >
              Randomize Fleet
            </button>
            <button type="button" className="btn btn-danger" onClick={clearPlayerFleet} disabled={localReady}>
              Clear
            </button>
          </div>
          <button type="button" className="btn btn-primary btn-large" onClick={startGame} disabled={!canStart}>
            {startLabel}
          </button>
        </div>

        <HowToPlay />
        {!isOnline && renderRanking()}
      </div>
    );
  }

  function renderTurnBanner() {
    if (phase === 'setup') {
      return (
        <div className="turn-banner turn-setup" role="status">
          <span className="turn-title">Setup</span>
          <span className="turn-sub">{message}</span>
        </div>
      );
    }
    if (gameOver) {
      return (
        <div className={`turn-banner ${phase === 'won' ? 'turn-won' : 'turn-lost'}`} role="status">
          <span className="turn-title">{phase === 'won' ? 'Victory!' : 'Defeat'}</span>
          <span className="turn-sub">{message}</span>
        </div>
      );
    }
    const yourTurn = phase === 'player';
    return (
      <div className={`turn-banner ${yourTurn ? 'turn-you' : 'turn-them'}`} role="status">
        <span className="turn-title">{yourTurn ? 'Your turn' : `${opponentName}'s turn`}</span>
        <span className="turn-sub">{message}</span>
        <span className="turn-timer" aria-label="Turn timer">
          {formatDuration(turnSeconds)}
        </span>
      </div>
    );
  }

  function renderResultOverlay() {
    if (!gameOver || !showResult) return null;
    const won = phase === 'won';
    const score = getScore(enemyBoard);
    return (
      <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="result-title">
        {won && (
          <div className="confetti" aria-hidden="true">
            {Array.from({ length: 24 }, (_, i) => (
              <span key={i} className="confetti-piece" style={{ '--i': i } as CSSProperties} />
            ))}
          </div>
        )}
        <div className={`result-card ${won ? 'result-won' : 'result-lost'}`}>
          <p className="result-kicker">{won ? 'Victory' : 'Defeat'}</p>
          <h2 id="result-title" className="result-title">
            {won ? 'You sank the enemy fleet!' : `${opponentName} sank your fleet`}
          </h2>
          <div className="result-stats">
            <div>
              <strong>{moves}</strong>
              <span>Moves</span>
            </div>
            <div>
              <strong>{score.hits}</strong>
              <span>Hits</span>
            </div>
            <div>
              <strong>{score.misses}</strong>
              <span>Misses</span>
            </div>
            <div>
              <strong>{score.shots ? Math.round((score.hits / score.shots) * 100) : 0}%</strong>
              <span>Accuracy</span>
            </div>
          </div>
          <div className="result-actions">
            <button type="button" className="btn btn-primary btn-large" onClick={playAgain}>
              {isOnline ? 'New Room' : 'Play Again'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={goToMenu}>
              New Game
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowResult(false)}>
              View boards
            </button>
          </div>
        </div>
      </div>
    );
  }

  const enemyDisabled =
    phase !== 'player' || (isOnline && (connection !== 'connected' || pendingShot !== null));
  const score = getScore(enemyBoard);

  return (
    <div className={`app mode-${mode}`}>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ⚓
          </span>
          <h1>Battleship</h1>
          {mode !== 'menu' && (
            <span className="mode-badge">{isOnline ? 'Online match' : 'vs AI'}</span>
          )}
        </div>
        {mode !== 'menu' && (
          <button type="button" className="btn btn-ghost" onClick={goToMenu}>
            ← Menu
          </button>
        )}
      </header>

      {mode === 'menu' ? (
        <main className="menu-main">
          <p className="tagline">Sink every enemy ship before they sink yours.</p>
          {renderModeMenu()}
        </main>
      ) : (
        <>
          {renderTurnBanner()}
          {sunkMessage && (
            <p className="sunk-message" role="status">
              {sunkMessage}
            </p>
          )}

          <main className="game">
            <section className="board-section">
              <div className="board-card">
                <BoardGrid
                  board={playerBoard}
                  label="Your Fleet"
                  isPlayerView
                  active={phase === 'opponent'}
                  turnLabel={
                    phase === 'setup'
                      ? 'Place ships here'
                      : phase === 'opponent'
                        ? `${opponentName} is targeting`
                        : inBattle
                          ? 'Waiting'
                          : undefined
                  }
                  previewCells={preview.cells}
                  previewValid={preview.valid}
                  onCellClick={phase === 'setup' && !localReady ? handleSetupCellClick : undefined}
                  onCellHover={phase === 'setup' && !localReady ? handleSetupCellHover : undefined}
                  onCellLeave={handleSetupCellLeave}
                />
                {phase !== 'setup' && <FleetStatus title="Your Ships" fleet={describeFleet(playerBoard)} />}
              </div>
            </section>

            <section className="board-section">
              {phase === 'setup' ? (
                renderPlacementPanel()
              ) : (
                <div className="board-card">
                  <BoardGrid
                    board={enemyBoard}
                    label="Enemy Fleet"
                    isPlayerView={false}
                    disabled={enemyDisabled}
                    active={phase === 'player'}
                    turnLabel={
                      phase === 'player' ? 'Fire here' : inBattle ? 'Waiting' : undefined
                    }
                    pendingCell={pendingShot}
                    onCellClick={handleEnemyCellClick}
                  />
                  <div className="scoreboard" aria-label="Scoreboard">
                    <div className="score-item score-hits">
                      <strong>{score.hits}</strong>
                      <span>Hits</span>
                    </div>
                    <div className="score-item score-misses">
                      <strong>{score.misses}</strong>
                      <span>Misses</span>
                    </div>
                    <div className="score-item score-moves">
                      <strong>{moves}</strong>
                      <span>Moves</span>
                    </div>
                  </div>
                  <FleetStatus title="Enemy Ships" fleet={describeFleet(enemyBoard)} hideHits={!isOnline} />
                  {isOnline && roomState && (
                    <div className="online-footer">
                      <span className={`connection-pill tone-${connectionLabel().tone}`}>
                        <span className="connection-dot" aria-hidden="true" />
                        {connectionLabel().text}
                      </span>
                    </div>
                  )}
                  {gameOver && !showResult && (
                    <button type="button" className="btn btn-primary play-again" onClick={() => setShowResult(true)}>
                      Show result
                    </button>
                  )}
                </div>
              )}
            </section>
          </main>

          {phase === 'setup' && (
            <div className="mobile-actions">
              <button type="button" className="btn btn-secondary" onClick={toggleOrientation} disabled={localReady}>
                Rotate
              </button>
              <button type="button" className="btn btn-secondary" onClick={randomizePlayerFleet} disabled={localReady}>
                Randomize
              </button>
              <button type="button" className="btn btn-primary" onClick={startGame} disabled={!canStart}>
                {startLabel}
              </button>
            </div>
          )}
        </>
      )}

      {renderResultOverlay()}
    </div>
  );
}

export default App;
