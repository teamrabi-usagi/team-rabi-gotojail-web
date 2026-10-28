/**
 * Socket.IO のイベント配線(Phase 1: room:create/join/reconnect/leave + disconnect)。
 * game:* イベントはPhase 2以降で追加する。
 *
 * 原則(サーバー権威):
 * - クライアントから来た値は必ずRoomStore側で検証する。ここでは信用しない。
 * - 秘密情報(reconnectToken)は`socket.emit`/`io.to(socketId).emit`で本人のsocketにだけ送る。
 *   `io.to(room).emit`に載せてはならない。
 * - 1 socket = 1 room = 1 player を強制する。既にbound済みのsocketがcreate/join/reconnectを
 *   呼んだら拒否する。別roomへ行くには明示的に`room:leave`が必要。
 * - 「memoryにroomが無い = ROOM_NOT_FOUND」と即断しない。`room:join`/`room:reconnect`は
 *   memory miss時にまずdurable repositoryを確認し、有効なsnapshotがあればhydrateしてから
 *   通常のjoin/reconnectロジックへ進む。
 * - state-changingなactionが成功するたびに、broadcastの直前でdurable snapshotを保存する。
 *   保存に失敗した場合はbroadcastせず、clientには「進んだように見えたのに実際は
 *   保存されていない」状態を作らない。
 */

import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/types.js';
import { normalizeCode, type Room, type RoomPlayer, type RoomStore, type StoreResult } from '../rooms/roomStore.js';
import type { RoomRepository } from '../persistence/roomRepository.js';
import { buildRoomSnapshot, hydrateRoomFromSnapshot, isSnapshotExpired } from '../persistence/roomSnapshot.js';
import type { GameManager } from '../game/gameManager.js';
import { toPublicGameState } from '../../shared/game/publicState.js';
import { toHandsView } from '../../shared/game/handsView.js';

type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

const ALREADY_IN_ROOM_ERROR = {
  code: 'ALREADY_IN_ROOM',
  message: 'すでに別のルームに参加中です。先に退出してください',
} as const;

const NOT_IN_ROOM_ERROR = {
  code: 'NOT_IN_ROOM',
  message: 'ルームに参加していません',
} as const;

const PERSISTENCE_FAILED_ERROR = {
  code: 'PERSISTENCE_FAILED',
  message: '保存に失敗しました。もう一度お試しください',
} as const;

/** durable snapshotのTTL(既定24時間。`ROOM_SNAPSHOT_TTL_MS`環境変数で変更可)。 */
export const DEFAULT_ROOM_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

export function registerSocketHandlers(
  io: AppServer,
  store: RoomStore,
  gameManager: GameManager,
  repository: RoomRepository,
  snapshotTtlMs: number = DEFAULT_ROOM_SNAPSHOT_TTL_MS,
): void {
  /** memoryに無ければdurable repositoryから復元を試みる。 */
  async function ensureHydrated(rawCode: unknown): Promise<void> {
    const code = normalizeCode(rawCode);
    if (code.length === 0 || store.getRoom(code) !== undefined) {
      return;
    }

    const snapshot = await repository.load(code);
    if (snapshot === null || isSnapshotExpired(snapshot, Date.now(), snapshotTtlMs)) {
      return;
    }

    store.hydrateRoom(hydrateRoomFromSnapshot(snapshot.room));
    if (snapshot.game !== null) {
      gameManager.hydrateGame(code, snapshot.game);
    }
  }

  /** 現在のroom(+あればGameState)のsnapshotをdurable storageへ保存する。失敗時はfalseを返す。 */
  async function persist(room: Room): Promise<boolean> {
    try {
      const game = gameManager.getGame(room.code) ?? null;
      await repository.save(room.code, buildRoomSnapshot(room, game, Date.now()));
      return true;
    } catch (err) {
      console.error(`[persistence] failed to save room ${room.code}:`, err);
      return false;
    }
  }

  io.on('connection', (socket: AppSocket) => {
    socket.on('room:create', (payload) => {
      if (store.isSocketBound(socket.id)) {
        socket.emit('room:error', ALREADY_IN_ROOM_ERROR);
        return;
      }

      void handleEntry(io, store, gameManager, persist, socket, store.createRoom(payload?.name));
    });

    socket.on('room:join', async (payload) => {
      if (store.isSocketBound(socket.id)) {
        socket.emit('room:error', ALREADY_IN_ROOM_ERROR);
        return;
      }

      await ensureHydrated(payload?.code);
      void handleEntry(io, store, gameManager, persist, socket, store.joinRoom(payload?.code, payload?.name));
    });

    socket.on('room:reconnect', async (payload) => {
      if (store.isSocketBound(socket.id)) {
        socket.emit('room:error', ALREADY_IN_ROOM_ERROR);
        return;
      }

      await ensureHydrated(payload?.code);
      void handleEntry(io, store, gameManager, persist, socket, store.reconnect(payload?.code, payload?.reconnectToken));
    });

    socket.on('room:leave', async () => {
      const left = store.detachSocket(socket.id);
      if (left === null) {
        return;
      }

      const { room, player } = left;
      void socket.leave(room.code);

      // lobby中の明示leaveのみseatを削除する。ゲーム開始後はdisconnect相当として
      // seatを保持し、reconnect tokenで戻れるようにする(Phase 2以降で適用)。
      if (room.status === 'lobby') {
        store.leave(room, player);
      }

      if (store.getRoom(room.code) === undefined) {
        await repository.delete(room.code).catch((err: unknown) => {
          console.error(`[persistence] failed to delete room ${room.code}:`, err);
        });
        return;
      }

      await broadcastRoomState(io, store, persist, room);
    });

    socket.on('disconnect', async () => {
      const left = store.detachSocket(socket.id);
      if (left === null) {
        return;
      }

      await broadcastRoomState(io, store, persist, left.room);
    });

    socket.on('game:start', async () => {
      const binding = store.getBySocket(socket.id);
      if (binding === null) {
        socket.emit('game:error', NOT_IN_ROOM_ERROR);
        return;
      }

      const result = gameManager.startGame(binding.room, binding.player.id);
      if (!result.ok) {
        socket.emit('game:error', { code: result.code, message: result.message });
        return;
      }

      if (!(await persist(binding.room))) {
        socket.emit('game:error', PERSISTENCE_FAILED_ERROR);
        return;
      }
      await broadcastRoomStateRaw(io, store, binding.room);
      broadcastGameStateRaw(io, store, gameManager, binding.room);
      broadcastHandsView(io, store, gameManager, binding.room);
    });

    socket.on('game:luckyPlacement:submit', async (payload) => {
      const binding = store.getBySocket(socket.id);
      if (binding === null) {
        socket.emit('game:error', NOT_IN_ROOM_ERROR);
        return;
      }

      const result = gameManager.submitLuckyPlacement(binding.room, binding.player.id, payload?.position);
      if (!result.ok) {
        socket.emit('game:error', { code: result.code, message: result.message });
        return;
      }

      if (!(await persist(binding.room))) {
        socket.emit('game:error', PERSISTENCE_FAILED_ERROR);
        return;
      }
      broadcastGameStateRaw(io, store, gameManager, binding.room);
      broadcastHandsView(io, store, gameManager, binding.room);
    });

    socket.on('game:flip', async () => {
      const binding = store.getBySocket(socket.id);
      if (binding === null) {
        socket.emit('game:error', NOT_IN_ROOM_ERROR);
        return;
      }

      const result = gameManager.flipCard(binding.room, binding.player.id);
      if (!result.ok) {
        socket.emit('game:error', { code: result.code, message: result.message });
        return;
      }

      if (!(await persist(binding.room))) {
        socket.emit('game:error', PERSISTENCE_FAILED_ERROR);
        return;
      }

      if (result.guardEvent !== null) {
        io.to(binding.room.code).emit('game:guard:resolved', result.guardEvent);
      }
      if (result.roundSummary !== null) {
        io.to(binding.room.code).emit('game:round:resolved', result.roundSummary);
      }
      broadcastGameStateRaw(io, store, gameManager, binding.room);
      broadcastHandsView(io, store, gameManager, binding.room);
      emitGameEndedIfNeeded(io, gameManager, binding.room);
    });

    socket.on('game:stop', async () => {
      const binding = store.getBySocket(socket.id);
      if (binding === null) {
        socket.emit('game:error', NOT_IN_ROOM_ERROR);
        return;
      }

      const result = gameManager.stop(binding.room, binding.player.id);
      if (!result.ok) {
        socket.emit('game:error', { code: result.code, message: result.message });
        return;
      }

      if (!(await persist(binding.room))) {
        socket.emit('game:error', PERSISTENCE_FAILED_ERROR);
        return;
      }

      if (result.roundSummary !== null) {
        io.to(binding.room.code).emit('game:round:resolved', result.roundSummary);
      }
      broadcastGameStateRaw(io, store, gameManager, binding.room);
      broadcastHandsView(io, store, gameManager, binding.room);
      emitGameEndedIfNeeded(io, gameManager, binding.room);
    });

    socket.on('chat:send', (payload) => {
      const binding = store.getBySocket(socket.id);
      if (binding === null) {
        socket.emit('game:error', NOT_IN_ROOM_ERROR);
        return;
      }

      const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
      if (text.length === 0 || text.length > 200) {
        socket.emit('game:error', { code: 'CHAT_MESSAGE_INVALID', message: 'チャットは1〜200文字で入力してください' });
        return;
      }

      io.to(binding.room.code).emit('chat:message', {
        id: randomUUID(),
        playerId: binding.player.id,
        text,
        at: Date.now(),
      });
    });
  });
}

function emitGameEndedIfNeeded(io: AppServer, gameManager: GameManager, room: Room): void {
  const state = gameManager.getGame(room.code);
  if (state?.phase === 'game_end' && state.winnerIds !== null) {
    io.to(room.code).emit('game:ended', { winnerIds: state.winnerIds });
  }
}

async function handleEntry(
  io: AppServer,
  store: RoomStore,
  gameManager: GameManager,
  persist: (room: Room) => Promise<boolean>,
  socket: AppSocket,
  result: StoreResult<{ room: Room; player: RoomPlayer; rawReconnectToken: string }>,
): Promise<void> {
  if (!result.ok) {
    socket.emit('room:error', { code: result.code, message: result.message });
    return;
  }

  const { room, player, rawReconnectToken } = result.value;

  const { previousSocketId } = store.attachSocket(room, player, socket.id);
  void socket.join(room.code);

  // reconnect tokenで別socketが同じplayerを引き継いだ場合、旧socketへ最小通知した上で切断する。
  if (previousSocketId !== null) {
    const previousSocket = io.sockets.sockets.get(previousSocketId);
    if (previousSocket !== undefined) {
      previousSocket.emit('session:replaced', {
        message: '別のタブ/デバイスで同じプレイヤーとして接続されました',
      });
      previousSocket.disconnect(true);
    }
  }

  if (!(await persist(room))) {
    socket.emit('room:error', PERSISTENCE_FAILED_ERROR);
    return;
  }

  socket.emit('room:joined', {
    self: { playerId: player.id, reconnectToken: rawReconnectToken },
    room: store.toPublicRoomState(room),
  });

  await broadcastRoomStateRaw(io, store, room);

  // ゲーム進行中のreconnectなら、現在のgame状態(公開情報+本人専用の手札ビュー)を届け直す。
  // ゲーム未開始なら何もしない。
  broadcastGameStateRaw(io, store, gameManager, room);
  broadcastHandsView(io, store, gameManager, room);
}

async function broadcastRoomState(
  io: AppServer,
  store: RoomStore,
  persist: (room: Room) => Promise<boolean>,
  room: Room,
): Promise<void> {
  if (store.getRoom(room.code) === undefined) {
    return;
  }

  if (!(await persist(room))) {
    return;
  }

  await broadcastRoomStateRaw(io, store, room);
}

async function broadcastRoomStateRaw(io: AppServer, store: RoomStore, room: Room): Promise<void> {
  if (store.getRoom(room.code) === undefined) {
    return;
  }

  io.to(room.code).emit('room:state', store.toPublicRoomState(room));
}

/** ルーム全員へ。公開情報のみ(カード種別データは含まない)。ゲーム未開始なら何もしない。 */
function broadcastGameStateRaw(io: AppServer, store: RoomStore, gameManager: GameManager, room: Room): void {
  if (store.getRoom(room.code) === undefined) {
    return;
  }

  const state = gameManager.getGame(room.code);
  if (state === undefined) {
    return;
  }

  io.to(room.code).emit('game:state', toPublicGameState(state));
}

/**
 * 手札ビューは視点ごとに異なるため、`io.to(room).emit`では配れない。
 * 接続中の各socketへ個別にemitする(docs/WEB_ARCHITECTURE.md §6)。ゲーム未開始なら何もしない。
 */
function broadcastHandsView(io: AppServer, store: RoomStore, gameManager: GameManager, room: Room): void {
  if (store.getRoom(room.code) === undefined) {
    return;
  }

  const state = gameManager.getGame(room.code);
  if (state === undefined) {
    return;
  }

  for (const player of room.players) {
    if (player.socketId === null) {
      continue;
    }
    io.to(player.socketId).emit('game:handsView', toHandsView(state, player.id));
  }
}
