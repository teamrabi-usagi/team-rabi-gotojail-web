import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClientToServerEvents, ServerToClientEvents } from '../src/shared/types.js';
import { RoomStore } from '../src/server/rooms/roomStore.js';
import { GameManager } from '../src/server/game/gameManager.js';
import { registerSocketHandlers } from '../src/server/socket/handlers.js';
import { MemoryRoomRepository } from '../src/server/persistence/memoryRoomRepository.js';
import { seededRng } from './rng.js';

type AppClientSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

function waitOnce<T>(socket: AppClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event as never, resolve as never));
}

describe('game socket integration (Phase 2: round setup + personalized hands view)', () => {
  let httpServer: ReturnType<typeof createServer>;
  let baseUrl: string;
  let clients: AppClientSocket[] = [];

  beforeEach(async () => {
    const store = new RoomStore();
    const gameManager = new GameManager(seededRng(123));
    const repository = new MemoryRoomRepository();

    httpServer = createServer();
    const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);
    registerSocketHandlers(io, store, gameManager, repository);

    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    const { port } = httpServer.address() as AddressInfo;
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    for (const client of clients) {
      client.disconnect();
    }
    clients = [];
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function connect(): AppClientSocket {
    const client: AppClientSocket = ioClient(baseUrl);
    clients.push(client);
    return client;
  }

  it('starts a 2-player game and gives each socket a personalized game:handsView', async () => {
    const a = connect();
    const b = connect();
    await Promise.all([waitOnce(a, 'connect'), waitOnce(b, 'connect')]);

    a.emit('room:create', { name: 'Alice' });
    const joinedA = await waitOnce<{ self: { playerId: string }; room: { code: string } }>(a, 'room:joined');

    b.emit('room:join', { code: joinedA.room.code, name: 'Bob' });
    const joinedB = await waitOnce<{ self: { playerId: string } }>(b, 'room:joined');

    const handsViewAPromise = waitOnce<{ viewerPlayerId: string; hands: unknown[] }>(a, 'game:handsView');
    const handsViewBPromise = waitOnce<{ viewerPlayerId: string; hands: unknown[] }>(b, 'game:handsView');
    a.emit('game:start');

    const [handsViewA, handsViewB] = await Promise.all([handsViewAPromise, handsViewBPromise]);

    expect(handsViewA.viewerPlayerId).toBe(joinedA.self.playerId);
    expect(handsViewB.viewerPlayerId).toBe(joinedB.self.playerId);

    // the two payloads must differ (each masks a different player's own hand)
    expect(handsViewA).not.toEqual(handsViewB);

    type HandView = { playerId: string; cards: readonly { revealed: boolean }[] };
    const aOwnHand = (handsViewA.hands as HandView[]).find((h) => h.playerId === joinedA.self.playerId)!;
    const aOtherHand = (handsViewA.hands as HandView[]).find((h) => h.playerId === joinedB.self.playerId)!;
    expect(aOwnHand.cards.every((c) => !c.revealed)).toBe(true);
    expect(aOtherHand.cards.every((c) => c.revealed)).toBe(true);

    const bOwnHand = (handsViewB.hands as HandView[]).find((h) => h.playerId === joinedB.self.playerId)!;
    const bOtherHand = (handsViewB.hands as HandView[]).find((h) => h.playerId === joinedA.self.playerId)!;
    expect(bOwnHand.cards.every((c) => !c.revealed)).toBe(true);
    expect(bOtherHand.cards.every((c) => c.revealed)).toBe(true);
  });

  it('advances to round_active once both lucky placements are submitted, and updates both handsViews', async () => {
    const a = connect();
    const b = connect();
    await Promise.all([waitOnce(a, 'connect'), waitOnce(b, 'connect')]);

    a.emit('room:create', { name: 'Alice' });
    const joinedA = await waitOnce<{ self: { playerId: string }; room: { code: string } }>(a, 'room:joined');
    b.emit('room:join', { code: joinedA.room.code, name: 'Bob' });
    await waitOnce(b, 'room:joined');

    const firstHandsView = waitOnce<unknown>(a, 'game:handsView');
    a.emit('game:start');
    await firstHandsView;

    const gameStateAfterA = waitOnce<{ phase: string }>(a, 'game:state');
    a.emit('game:luckyPlacement:submit', { position: 0 });
    const afterFirstPlacement = await gameStateAfterA;
    expect(afterFirstPlacement.phase).toBe('round_setup');

    const gameStateAfterB = waitOnce<{ phase: string }>(a, 'game:state');
    const handsViewAfterB = waitOnce<{ hands: readonly { handReady: boolean }[] }>(a, 'game:handsView');
    b.emit('game:luckyPlacement:submit', { position: 0 });
    const afterSecondPlacement = await gameStateAfterB;
    expect(afterSecondPlacement.phase).toBe('round_active');

    const handsView = await handsViewAfterB;
    expect(handsView.hands.every((h) => h.handReady)).toBe(true);
  });

  it('rejects an out-of-range lucky placement with game:error, without crashing the room', async () => {
    const a = connect();
    const b = connect();
    await Promise.all([waitOnce(a, 'connect'), waitOnce(b, 'connect')]);

    a.emit('room:create', { name: 'Alice' });
    const joinedA = await waitOnce<{ room: { code: string } }>(a, 'room:joined');
    b.emit('room:join', { code: joinedA.room.code, name: 'Bob' });
    await waitOnce(b, 'room:joined');

    const firstHandsView = waitOnce<unknown>(a, 'game:handsView');
    a.emit('game:start');
    await firstHandsView;

    const errorPromise = waitOnce<{ code: string }>(a, 'game:error');
    a.emit('game:luckyPlacement:submit', { position: 99 });
    const error = await errorPromise;
    expect(error.code).toBeTypeOf('string');
  });
});
