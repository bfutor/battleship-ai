import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import type { Board, FireResult, Position, Ship, ShipName } from './types';
import { cloneBoard } from './board';

export type Role = 'host' | 'guest';

export type ConnectionState =
  | 'connecting'
  | 'waiting'
  | 'connected'
  | 'opponent-left'
  | 'room-full'
  | 'error';

export interface ShotResult {
  row: number;
  col: number;
  hit: boolean;
  sunk: boolean;
  shipName: ShipName | null;
  // Only populated when `sunk` is true; every listed cell has already been hit,
  // so this reveals nothing about ships still afloat.
  sunkPositions: Position[];
  fleetSunk: boolean;
}

export type MultiplayerEvent =
  | { type: 'opponent-joined' }
  | { type: 'opponent-ready' }
  | { type: 'opponent-shot'; row: number; col: number }
  | { type: 'shot-result'; result: ShotResult }
  | { type: 'opponent-left' };

export interface RoomState {
  roomId: string;
  role: Role;
  connection: ConnectionState;
  localReady: boolean;
  opponentReady: boolean;
  turn: Role;
}

export interface PresenceEntry {
  playerId: string;
  role: Role;
}

export interface RoomTransport {
  subscribe(onStatus: (status: 'connected' | 'error' | 'closed') => void): void;
  send(event: string, payload: unknown): Promise<void>;
  onMessage(handler: (event: string, payload: unknown) => void): void;
  track(entry: PresenceEntry): Promise<void>;
  onPresence(handler: (peers: PresenceEntry[]) => void): void;
  close(): Promise<void>;
}

export type TransportFactory = (roomId: string) => RoomTransport;

export interface MultiplayerRoom {
  readonly playerId: string;
  getState(): RoomState;
  subscribe(listener: (state: RoomState) => void): () => void;
  onEvent(handler: (event: MultiplayerEvent) => void): () => void;
  setReady(): Promise<void>;
  fire(row: number, col: number): Promise<void>;
  reportShotResult(result: ShotResult): Promise<void>;
  leave(): Promise<void>;
}

const ROOM_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function generateRoomId(): string {
  return crypto.randomUUID();
}

export function isValidRoomId(roomId: string): boolean {
  return ROOM_ID_PATTERN.test(roomId);
}

export function parseRoomIdFromHash(hash: string): string | null {
  const match = /^#\/game\/([^/?]+)/.exec(hash.trim());
  if (!match) return null;
  const roomId = decodeURIComponent(match[1]);
  return isValidRoomId(roomId) ? roomId : null;
}

export function buildInviteLink(roomId: string, origin: string, pathname = '/'): string {
  return `${origin}${pathname}#/game/${roomId}`;
}

export function getSupabaseConfig(env: Record<string, string | undefined>) {
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function createSupabaseTransportFactory(url: string, anonKey: string): TransportFactory {
  const client = createClient(url, anonKey, { realtime: { params: { eventsPerSecond: 20 } } });

  return (roomId: string): RoomTransport => {
    let channel: RealtimeChannel | null = null;
    const messageHandlers: ((event: string, payload: unknown) => void)[] = [];
    const presenceHandlers: ((peers: PresenceEntry[]) => void)[] = [];

    function getChannel(): RealtimeChannel {
      if (!channel) {
        channel = client.channel(`battleship:${roomId}`, {
          config: { broadcast: { self: false, ack: true }, presence: { key: crypto.randomUUID() } },
        });
        channel.on('broadcast', { event: '*' }, (message) => {
          for (const handler of messageHandlers) handler(message.event, message.payload);
        });
        channel.on('presence', { event: 'sync' }, () => {
          const state = channel!.presenceState<PresenceEntry>();
          const peers = Object.values(state).flatMap((entries) =>
            entries.map((e) => ({ playerId: e.playerId, role: e.role }))
          );
          for (const handler of presenceHandlers) handler(peers);
        });
      }
      return channel;
    }

    return {
      subscribe(onStatus) {
        getChannel().subscribe((status) => {
          if (status === 'SUBSCRIBED') onStatus('connected');
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') onStatus('error');
          else if (status === 'CLOSED') onStatus('closed');
        });
      },
      async send(event, payload) {
        await getChannel().send({ type: 'broadcast', event, payload });
      },
      onMessage(handler) {
        messageHandlers.push(handler);
      },
      async track(entry) {
        await getChannel().track(entry);
      },
      onPresence(handler) {
        presenceHandlers.push(handler);
      },
      async close() {
        if (channel) {
          await client.removeChannel(channel);
          channel = null;
        }
      },
    };
  };
}

interface ShotPayload {
  row: number;
  col: number;
}

function isShotPayload(payload: unknown): payload is ShotPayload {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return Number.isInteger(p.row) && Number.isInteger(p.col);
}

function isShotResult(payload: unknown): payload is ShotResult {
  if (!isShotPayload(payload)) return false;
  const p = payload as unknown as Record<string, unknown>;
  return (
    typeof p.hit === 'boolean' &&
    typeof p.sunk === 'boolean' &&
    typeof p.fleetSunk === 'boolean' &&
    Array.isArray(p.sunkPositions)
  );
}

function openRoom(roomId: string, role: Role, factory: TransportFactory): MultiplayerRoom {
  const playerId = crypto.randomUUID();
  const transport = factory(roomId);
  const listeners = new Set<(state: RoomState) => void>();
  const eventHandlers = new Set<(event: MultiplayerEvent) => void>();
  let opponentPresent = false;
  let opponentId: string | null = null;
  let closed = false;

  let state: RoomState = {
    roomId,
    role,
    connection: 'connecting',
    localReady: false,
    opponentReady: false,
    turn: 'host',
  };

  function update(patch: Partial<RoomState>) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  }

  function emit(event: MultiplayerEvent) {
    for (const handler of eventHandlers) handler(event);
  }

  transport.onPresence((peers) => {
    if (closed) return;
    if (state.connection === 'room-full') return;
    const others = peers.filter((p) => p.playerId !== playerId);
    const rivals = others.filter((p) => p.role === role);
    const opponents = others
      .filter((p) => p.role !== role)
      .sort((a, b) => a.playerId.localeCompare(b.playerId));

    if (!opponentId && rivals.length > 0) {
      update({ connection: 'room-full' });
      return;
    }
    if (!opponentId && opponents.length > 0) opponentId = opponents[0].playerId;

    const nowPresent = opponentId !== null && opponents.some((p) => p.playerId === opponentId);
    if (nowPresent && !opponentPresent) {
      opponentPresent = true;
      update({ connection: 'connected' });
      emit({ type: 'opponent-joined' });
      if (state.localReady) void transport.send('ready', {});
    } else if (!nowPresent && opponentPresent) {
      opponentPresent = false;
      opponentId = null;
      update({ connection: 'opponent-left' });
      emit({ type: 'opponent-left' });
    } else if (!nowPresent && state.connection === 'connecting') {
      update({ connection: 'waiting' });
    }
  });

  transport.onMessage((event, payload) => {
    if (closed) return;
    switch (event) {
      case 'ready':
        if (!state.opponentReady) {
          update({ opponentReady: true });
          emit({ type: 'opponent-ready' });
        }
        break;
      case 'shot':
        if (isShotPayload(payload)) {
          update({ turn: role });
          emit({ type: 'opponent-shot', row: payload.row, col: payload.col });
        }
        break;
      case 'shot-result':
        if (isShotResult(payload)) {
          emit({ type: 'shot-result', result: payload });
        }
        break;
    }
  });

  transport.subscribe((status) => {
    if (closed) return;
    if (status === 'connected') {
      if (state.connection === 'connecting') update({ connection: 'waiting' });
      void transport.track({ playerId, role });
    } else if (status === 'error') {
      update({ connection: 'error' });
    }
  });

  return {
    playerId,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    onEvent(handler) {
      eventHandlers.add(handler);
      return () => eventHandlers.delete(handler);
    },
    async setReady() {
      if (state.localReady) return;
      update({ localReady: true });
      await transport.send('ready', {});
    },
    async fire(row, col) {
      if (state.turn !== role) throw new Error('Not your turn');
      update({ turn: role === 'host' ? 'guest' : 'host' });
      await transport.send('shot', { row, col } satisfies ShotPayload);
    },
    async reportShotResult(result) {
      await transport.send('shot-result', result);
    },
    async leave() {
      if (closed) return;
      closed = true;
      await transport.close();
    },
  };
}

export function createRoom(factory: TransportFactory, roomId = generateRoomId()): MultiplayerRoom {
  return openRoom(roomId, 'host', factory);
}

export function joinRoom(roomId: string, factory: TransportFactory): MultiplayerRoom {
  return openRoom(roomId, 'guest', factory);
}

export function opponentOf(role: Role): Role {
  return role === 'host' ? 'guest' : 'host';
}

export function toShotResult(
  fireResult: FireResult,
  row: number,
  col: number,
  fleetSunk: boolean
): ShotResult {
  return {
    row,
    col,
    hit: fireResult.ship !== null,
    sunk: fireResult.sunk,
    shipName: fireResult.ship?.name ?? null,
    sunkPositions: fireResult.sunk && fireResult.ship ? fireResult.ship.positions : [],
    fleetSunk,
  };
}

// Applies an opponent-reported result to our view of their board. Their ships are
// unknown to us, so only the shot cell (and a fully-sunk ship's cells) are filled in.
export function applyShotResult(board: Board, result: ShotResult): Board {
  const next = cloneBoard(board);
  next.cells[result.row][result.col].state = result.hit ? 'hit' : 'miss';
  if (result.sunk && result.shipName && result.sunkPositions.length > 0) {
    const ship: Ship = {
      name: result.shipName,
      length: result.sunkPositions.length,
      positions: result.sunkPositions,
      hits: result.sunkPositions.length,
      sunk: true,
    };
    next.ships.push(ship);
    for (const pos of result.sunkPositions) {
      next.cells[pos.row][pos.col] = { state: 'hit', ship };
    }
  }
  return next;
}
