import { describe, expect, it, vi } from 'vitest';
import { createEmptyBoard, fireAt, placeShip } from './board';
import { createMemoryHub } from '../test/memoryTransport';
import {
  applyShotResult,
  buildInviteLink,
  toShotResult,
  createRoom,
  getSupabaseConfig,
  isValidRoomId,
  joinRoom,
  opponentOf,
  parseRoomIdFromHash,
  type MultiplayerEvent,
} from './multiplayer';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('room id helpers', () => {
  it('parses a room id from the location hash', () => {
    const id = '123e4567-e89b-12d3-a456-426614174000';
    expect(parseRoomIdFromHash(`#/game/${id}`)).toBe(id);
    expect(parseRoomIdFromHash(`#/game/${id}?x=1`)).toBe(id);
    expect(parseRoomIdFromHash('#/game/not-a-uuid')).toBeNull();
    expect(parseRoomIdFromHash('')).toBeNull();
    expect(parseRoomIdFromHash('#/other')).toBeNull();
  });

  it('validates room ids and builds invite links', () => {
    expect(isValidRoomId('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(isValidRoomId('nope')).toBe(false);
    expect(buildInviteLink('abc', 'https://example.com', '/play/')).toBe(
      'https://example.com/play/#/game/abc'
    );
    expect(opponentOf('host')).toBe('guest');
    expect(opponentOf('guest')).toBe('host');
  });

  it('reads Supabase config from env', () => {
    expect(getSupabaseConfig({})).toBeNull();
    expect(getSupabaseConfig({ VITE_SUPABASE_URL: 'u', VITE_SUPABASE_ANON_KEY: 'k' })).toEqual({
      url: 'u',
      anonKey: 'k',
    });
  });
});

describe('shot result helpers', () => {
  it('converts a fire result and applies it to the opponent view without leaking ships', () => {
    const defender = placeShip(createEmptyBoard(), 'Destroyer', { row: 0, col: 0 }, 'horizontal');
    const first = fireAt(defender, 0, 0);
    const firstResult = toShotResult(first.result, 0, 0, false);
    expect(firstResult).toMatchObject({ hit: true, sunk: false, shipName: 'Destroyer', sunkPositions: [] });

    const second = fireAt(first.board, 0, 1);
    const secondResult = toShotResult(second.result, 0, 1, true);
    expect(secondResult.sunk).toBe(true);
    expect(secondResult.sunkPositions).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ]);

    let view = applyShotResult(createEmptyBoard(), firstResult);
    expect(view.cells[0][0].state).toBe('hit');
    expect(view.ships).toHaveLength(0);

    view = applyShotResult(view, toShotResult(fireAt(defender, 5, 5).result, 5, 5, false));
    expect(view.cells[5][5].state).toBe('miss');

    view = applyShotResult(view, secondResult);
    expect(view.ships).toHaveLength(1);
    expect(view.ships[0]).toMatchObject({ name: 'Destroyer', sunk: true, length: 2 });
    expect(view.cells[0][1].ship?.sunk).toBe(true);
  });
});

describe('multiplayer room', () => {
  it('host waits until a guest joins, then both are connected', async () => {
    const { factory } = createMemoryHub();
    const host = createRoom(factory);
    const hostEvents: MultiplayerEvent[] = [];
    host.onEvent((e) => hostEvents.push(e));
    await flush();

    expect(host.getState().connection).toBe('waiting');
    expect(isValidRoomId(host.getState().roomId)).toBe(true);

    const guest = joinRoom(host.getState().roomId, factory);
    await flush();

    expect(host.getState().connection).toBe('connected');
    expect(guest.getState().connection).toBe('connected');
    expect(guest.getState().role).toBe('guest');
    expect(hostEvents).toContainEqual({ type: 'opponent-joined' });
  });

  it('syncs ready state, including when ready is set before the opponent arrives', async () => {
    const { factory } = createMemoryHub();
    const host = createRoom(factory);
    await flush();
    await host.setReady();

    const guest = joinRoom(host.getState().roomId, factory);
    const guestEvents: MultiplayerEvent[] = [];
    guest.onEvent((e) => guestEvents.push(e));
    await flush();

    expect(guest.getState().opponentReady).toBe(true);
    expect(guestEvents).toContainEqual({ type: 'opponent-ready' });
    expect(host.getState().opponentReady).toBe(false);

    await guest.setReady();
    await flush();
    expect(host.getState().opponentReady).toBe(true);
    expect(host.getState().turn).toBe('host');
  });

  it('relays shots and shot results and alternates turns', async () => {
    const { factory } = createMemoryHub();
    const host = createRoom(factory);
    await flush();
    const guest = joinRoom(host.getState().roomId, factory);
    await flush();

    const guestEvents: MultiplayerEvent[] = [];
    const hostEvents: MultiplayerEvent[] = [];
    guest.onEvent((e) => guestEvents.push(e));
    host.onEvent((e) => hostEvents.push(e));

    await expect(guest.fire(0, 0)).rejects.toThrow('Not your turn');

    await host.fire(2, 3);
    expect(host.getState().turn).toBe('guest');
    expect(guestEvents).toContainEqual({ type: 'opponent-shot', row: 2, col: 3 });
    expect(guest.getState().turn).toBe('guest');

    const result = { row: 2, col: 3, hit: true, sunk: false, shipName: 'Cruiser' as const, sunkPositions: [], fleetSunk: false };
    await guest.reportShotResult(result);
    expect(hostEvents).toContainEqual({ type: 'shot-result', result });

    await guest.fire(5, 5);
    expect(hostEvents).toContainEqual({ type: 'opponent-shot', row: 5, col: 5 });
    expect(host.getState().turn).toBe('host');
  });

  it('reports opponent disconnects and rejects a third player', async () => {
    const { factory } = createMemoryHub();
    const host = createRoom(factory);
    await flush();
    const guest = joinRoom(host.getState().roomId, factory);
    await flush();

    const intruder = joinRoom(host.getState().roomId, factory);
    await flush();
    expect(intruder.getState().connection).toBe('room-full');
    await intruder.leave();
    await flush();

    const listener = vi.fn();
    host.subscribe(listener);
    await guest.leave();
    await flush();

    expect(host.getState().connection).toBe('opponent-left');
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ connection: 'opponent-left' }));
  });
});
