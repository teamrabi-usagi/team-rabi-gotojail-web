/**
 * Room(+あればGameState)を durable storage(`RoomRepository`)へ保存してよい形
 * (snapshot)へ変換する、pure関数群。
 *
 * `GameState`(`src/shared/game/state.ts`)はMap/Set/Date/関数を含まないプレーンな
 * データ(Record・配列・プリミティブのみ)のため、そのまま`JSON.stringify`/`JSON.parse`で
 * 損失なく往復できる。`socketId`(プロセス再起動のたびに無意味になるephemeral値)だけは
 * Room側のsnapshotに含めず、復元時に必ず`null`で初期化する。
 */

import type { RoomStatus } from '../../shared/types.js';
import type { GameState } from '../../shared/game/state.js';
import type { Room, RoomPlayer } from '../rooms/roomStore.js';

export interface PersistedRoomPlayer {
  readonly id: string;
  readonly name: string;
  readonly isHost: boolean;
  /** raw tokenではなくhashのみ。 */
  readonly reconnectTokenHash: string;
}

export interface PersistedRoom {
  readonly code: string;
  readonly status: RoomStatus;
  readonly players: readonly PersistedRoomPlayer[];
  readonly emptySince: number | null;
}

export interface RoomSnapshot {
  readonly room: PersistedRoom;
  /** ゲーム未開始(lobby中)ならnull。 */
  readonly game: GameState | null;
  /** このsnapshotを保存した時刻(epoch ms)。TTL判定に使う。 */
  readonly updatedAt: number;
}

/** 現在のRoom(+あればGameState)から、永続化してよい形のsnapshotを作る。`socketId`は意図的に含めない。 */
export function buildRoomSnapshot(room: Room, game: GameState | null, now: number): RoomSnapshot {
  return {
    room: {
      code: room.code,
      status: room.status,
      players: room.players.map((p) => toPersistedPlayer(p)),
      emptySince: room.emptySince,
    },
    game,
    updatedAt: now,
  };
}

function toPersistedPlayer(player: RoomPlayer): PersistedRoomPlayer {
  return {
    id: player.id,
    name: player.name,
    isHost: player.isHost,
    reconnectTokenHash: player.reconnectTokenHash,
  };
}

/** snapshotのroom部分から、process内で使えるRoomへ復元する。`socketId`は必ず`null`で初期化する。 */
export function hydrateRoomFromSnapshot(persisted: PersistedRoom): Room {
  return {
    code: persisted.code,
    status: persisted.status,
    players: persisted.players.map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      reconnectTokenHash: p.reconnectTokenHash,
      socketId: null,
    })),
    emptySince: persisted.emptySince,
  };
}

export function isSnapshotExpired(snapshot: RoomSnapshot, now: number, ttlMs: number): boolean {
  return now - snapshot.updatedAt > ttlMs;
}
