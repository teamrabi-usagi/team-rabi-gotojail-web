import { describe, expect, it } from 'vitest';
import { buildRoomSnapshot, hydrateRoomFromSnapshot } from '../src/server/persistence/roomSnapshot.js';
import { MemoryRoomRepository } from '../src/server/persistence/memoryRoomRepository.js';
import { RoomStore } from '../src/server/rooms/roomStore.js';
import { GameManager } from '../src/server/game/gameManager.js';
import { createGameState, submitLuckyPlacement } from '../src/shared/game/engine.js';
import { seededRng } from './rng.js';

describe('RoomSnapshot round-trip', () => {
  it('round-trips a Room with no game (lobby) through JSON (simulating JSONB storage)', () => {
    const store = new RoomStore();
    const created = store.createRoom('Alice');
    if (!created.ok) throw new Error('unreachable');

    const snapshot = buildRoomSnapshot(created.value.room, null, 1000);
    const roundTripped = JSON.parse(JSON.stringify(snapshot));

    expect(roundTripped.game).toBeNull();
    const restoredRoom = hydrateRoomFromSnapshot(roundTripped.room);
    expect(restoredRoom.code).toBe(created.value.room.code);
    expect(restoredRoom.players).toHaveLength(1);
    expect(restoredRoom.players[0]?.socketId).toBeNull();
  });

  it('round-trips a mid-game GameState through JSON losslessly', () => {
    const ids = ['p0', 'p1', 'p2'];
    const state = createGameState(ids, seededRng(7));
    submitLuckyPlacement(state, ids[0] as string, 0, 0);

    const snapshot = buildRoomSnapshot(
      { code: 'ABCD', status: 'playing', players: [], emptySince: null },
      state,
      2000,
    );
    const roundTripped = JSON.parse(JSON.stringify(snapshot));

    expect(roundTripped.game).toEqual(state);
    expect(roundTripped.game.phase).toBe('round_setup');
    expect(roundTripped.game.players.p0.mainSeven).toHaveLength(7);
  });
});

describe('durable restart simulation (shared MemoryRoomRepository across GameManager instances)', () => {
  it('restores an in-progress game after a simulated process restart', async () => {
    const sharedRepository = new MemoryRoomRepository();

    // "process 1": create a room, start a game, save a snapshot mid-round.
    const store1 = new RoomStore();
    const gameManager1 = new GameManager(seededRng(11));
    const created = store1.createRoom('Alice');
    if (!created.ok) throw new Error('unreachable');
    const joined = store1.joinRoom(created.value.room.code, 'Bob');
    if (!joined.ok) throw new Error('unreachable');

    const startResult = gameManager1.startGame(created.value.room, created.value.player.id);
    expect(startResult.ok).toBe(true);
    if (!startResult.ok) return;

    await sharedRepository.save(
      created.value.room.code,
      buildRoomSnapshot(created.value.room, gameManager1.getGame(created.value.room.code) ?? null, Date.now()),
    );

    // "process 2": fresh in-memory store/manager, nothing known yet.
    const store2 = new RoomStore();
    const gameManager2 = new GameManager(seededRng(12));
    expect(store2.getRoom(created.value.room.code)).toBeUndefined();

    const loaded = await sharedRepository.load(created.value.room.code);
    expect(loaded).not.toBeNull();
    if (loaded === null) return;

    store2.hydrateRoom(hydrateRoomFromSnapshot(loaded.room));
    if (loaded.game !== null) {
      gameManager2.hydrateGame(created.value.room.code, loaded.game);
    }

    const restoredRoom = store2.getRoom(created.value.room.code);
    expect(restoredRoom?.players).toHaveLength(2);
    expect(restoredRoom?.status).toBe('playing');

    const restoredGame = gameManager2.getGame(created.value.room.code);
    expect(restoredGame).not.toBeUndefined();
    expect(restoredGame?.phase).toBe('round_setup');
    expect(restoredGame?.playerOrder).toHaveLength(2);
  });
});
