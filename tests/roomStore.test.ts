import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS, MIN_PLAYERS, RoomStore } from '../src/server/rooms/roomStore.js';

describe('RoomStore.createRoom / joinRoom', () => {
  it('creates a room with the creator as host, and MIN_PLAYERS/MAX_PLAYERS are 2 and 5', () => {
    expect(MIN_PLAYERS).toBe(2);
    expect(MAX_PLAYERS).toBe(5);

    const store = new RoomStore();
    const created = store.createRoom('Alice');
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(created.value.room.players).toHaveLength(1);
    expect(created.value.player.isHost).toBe(true);
  });

  it('rejects an empty or overlong name', () => {
    const store = new RoomStore();
    expect(store.createRoom('').ok).toBe(false);
    expect(store.createRoom('x'.repeat(21)).ok).toBe(false);
  });

  it('lets a second player join by room code (case-insensitive)', () => {
    const store = new RoomStore();
    const created = store.createRoom('Alice');
    if (!created.ok) throw new Error('unreachable');

    const joined = store.joinRoom(created.value.room.code.toLowerCase(), 'Bob');
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    expect(joined.value.room.players).toHaveLength(2);
    expect(joined.value.player.isHost).toBe(false);
  });

  it('rejects joining a nonexistent room code', () => {
    const store = new RoomStore();
    expect(store.joinRoom('ZZZZ', 'Bob').ok).toBe(false);
  });

  it('rejects joining once the room is full (MAX_PLAYERS=5)', () => {
    const store = new RoomStore();
    const created = store.createRoom('p1');
    if (!created.ok) throw new Error('unreachable');
    const code = created.value.room.code;

    for (let i = 2; i <= 5; i++) {
      const result = store.joinRoom(code, `p${i}`);
      expect(result.ok).toBe(true);
    }

    const overflow = store.joinRoom(code, 'p6');
    expect(overflow.ok).toBe(false);
    if (!overflow.ok) {
      expect(overflow.code).toBe('ROOM_FULL');
    }
  });

  it('rejects joining a room that has already started', () => {
    const store = new RoomStore();
    const created = store.createRoom('p1');
    if (!created.ok) throw new Error('unreachable');
    created.value.room.status = 'playing';

    const result = store.joinRoom(created.value.room.code, 'late');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('ROOM_ALREADY_STARTED');
    }
  });
});

describe('RoomStore.reconnect', () => {
  it('reconnects with the correct raw token', () => {
    const store = new RoomStore();
    const created = store.createRoom('Alice');
    if (!created.ok) throw new Error('unreachable');

    const reconnected = store.reconnect(created.value.room.code, created.value.rawReconnectToken);
    expect(reconnected.ok).toBe(true);
    if (!reconnected.ok) return;
    expect(reconnected.value.player.id).toBe(created.value.player.id);
  });

  it('rejects an incorrect token', () => {
    const store = new RoomStore();
    const created = store.createRoom('Alice');
    if (!created.ok) throw new Error('unreachable');

    const reconnected = store.reconnect(created.value.room.code, 'wrong-token');
    expect(reconnected.ok).toBe(false);
  });
});

describe('RoomStore socket binding / leave', () => {
  it('attachSocket + getBySocket round-trips, detachSocket clears the binding', () => {
    const store = new RoomStore();
    const created = store.createRoom('Alice');
    if (!created.ok) throw new Error('unreachable');
    const { room, player } = created.value;

    store.attachSocket(room, player, 'socket-1');
    expect(store.isSocketBound('socket-1')).toBe(true);
    expect(store.getBySocket('socket-1')?.player.id).toBe(player.id);

    store.detachSocket('socket-1');
    expect(store.isSocketBound('socket-1')).toBe(false);
  });

  it('reassigns host to the next player when the host leaves', () => {
    const store = new RoomStore();
    const created = store.createRoom('Alice');
    if (!created.ok) throw new Error('unreachable');
    const joined = store.joinRoom(created.value.room.code, 'Bob');
    if (!joined.ok) throw new Error('unreachable');

    store.leave(created.value.room, created.value.player);
    expect(joined.value.room.players).toHaveLength(1);
    expect(joined.value.room.players[0]?.isHost).toBe(true);
  });

  it('deletes the room once the last player leaves', () => {
    const store = new RoomStore();
    const created = store.createRoom('Alice');
    if (!created.ok) throw new Error('unreachable');
    const { room, player } = created.value;

    store.leave(room, player);
    expect(store.getRoom(room.code)).toBeUndefined();
  });
});

describe('RoomStore.toPublicRoomState', () => {
  it('never includes reconnectTokenHash', () => {
    const store = new RoomStore();
    const created = store.createRoom('Alice');
    if (!created.ok) throw new Error('unreachable');

    const publicState = store.toPublicRoomState(created.value.room);
    for (const player of publicState.players) {
      expect(Object.keys(player)).not.toContain('reconnectTokenHash');
    }
  });
});
