import type { PresenceEntry, RoomTransport, TransportFactory } from '../logic/multiplayer';

// In-memory transport hub that mimics Supabase broadcast + presence semantics.
export function createMemoryHub() {
  const rooms = new Map<string, Set<MemoryTransport>>();

  class MemoryTransport implements RoomTransport {
    private messageHandlers: ((event: string, payload: unknown) => void)[] = [];
    private presenceHandlers: ((peers: PresenceEntry[]) => void)[] = [];
    private statusHandler: ((status: 'connected' | 'error' | 'closed') => void) | null = null;
    presence: PresenceEntry | null = null;
    connected = false;
    private roomId: string;

    constructor(roomId: string) {
      this.roomId = roomId;
      if (!rooms.has(roomId)) rooms.set(roomId, new Set());
      rooms.get(roomId)!.add(this);
    }

    private peers() {
      return [...rooms.get(this.roomId)!].filter((t) => t.connected);
    }

    subscribe(onStatus: (status: 'connected' | 'error' | 'closed') => void) {
      this.statusHandler = onStatus;
      queueMicrotask(() => {
        this.connected = true;
        onStatus('connected');
      });
    }

    async send(event: string, payload: unknown) {
      await Promise.resolve();
      for (const peer of this.peers()) {
        if (peer !== this) peer.messageHandlers.forEach((h) => h(event, payload));
      }
    }

    onMessage(handler: (event: string, payload: unknown) => void) {
      this.messageHandlers.push(handler);
    }

    async track(entry: PresenceEntry) {
      this.presence = entry;
      this.syncAll();
    }

    onPresence(handler: (peers: PresenceEntry[]) => void) {
      this.presenceHandlers.push(handler);
    }

    async close() {
      this.connected = false;
      rooms.get(this.roomId)!.delete(this);
      this.statusHandler?.('closed');
      this.syncAll();
    }

    private syncAll() {
      const entries = this.peers()
        .map((t) => t.presence)
        .filter((p): p is PresenceEntry => p !== null);
      for (const peer of this.peers()) {
        peer.presenceHandlers.forEach((h) => h(entries));
      }
    }
  }

  const factory: TransportFactory = (roomId) => new MemoryTransport(roomId);
  return { factory };
}
