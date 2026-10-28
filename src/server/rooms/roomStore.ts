/**
 * ルーム管理(作成/参加/再接続の骨格)。team-rabi-rrrr-webの roomStore.ts パターンを
 * 踏襲し、人数制約だけ2〜5人に変更している。CPU対戦・ソロルームは本ゲームにはない。
 *
 * - `rooms`自体はprocess内のin-memory Mapで、実際のゲーム進行の読み書きは
 *   すべて同期・高速に行う。durable repository(persistence/)と組み合わせ、
 *   プロセス再起動後にsnapshotから`hydrateRoom()`で復元できる。
 * - `reconnectTokenHash`は本人確認用のSHA-256 hash(raw tokenはserver側に一切
 *   保持しない)。raw tokenは生成した瞬間だけ呼び出し元へ返す。
 * - `socketId`はプロセス再起動のたびに無意味になるephemeral値のため、
 *   永続化されるsnapshotには含めない(persistence/roomSnapshot.ts参照)。
 */

import { randomUUID, randomBytes } from 'node:crypto';
import type { PublicRoomState, RoomStatus } from '../../shared/types.js';
import { hashReconnectToken } from './reconnectToken.js';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;

export const MAX_NAME_LENGTH = 20;

/** ルームコードの文字集合。0/O・1/I/L のような紛らわしい文字を除く。 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;

/** 誰も接続していないルームを掃除するまでの猶予。 */
const EMPTY_ROOM_TTL_MS = 60 * 60 * 1000;

export interface RoomPlayer {
  readonly id: string;
  name: string;
  isHost: boolean;
  /** raw reconnectTokenのSHA-256 hash。broadcast禁止(`toPublicRoomState()`には含めない)。 */
  readonly reconnectTokenHash: string;
  socketId: string | null;
}

export interface Room {
  readonly code: string;
  status: RoomStatus;
  players: RoomPlayer[];
  /** 全員が切断された時刻。誰かが接続中の間は null。 */
  emptySince: number | null;
}

export type StoreResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: string; readonly message: string };

function fail<T>(code: string, message: string): StoreResult<T> {
  return { ok: false, code, message };
}

export function normalizeName(raw: unknown): StoreResult<string> {
  if (typeof raw !== 'string') {
    return fail('INVALID_NAME', '表示名が不正です');
  }

  const name = raw.trim();
  if (name.length === 0) {
    return fail('INVALID_NAME', '表示名を入力してください');
  }
  if (name.length > MAX_NAME_LENGTH) {
    return fail('INVALID_NAME', `表示名は${MAX_NAME_LENGTH}文字以内にしてください`);
  }

  return { ok: true, value: name };
}

export function normalizeCode(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toUpperCase() : '';
}

interface SocketBinding {
  readonly code: string;
  readonly playerId: string;
}

export class RoomStore {
  private readonly rooms = new Map<string, Room>();

  /** 1 socket = 1 room = 1 player を明示的に管理する。`detachSocket()`が「全room先頭一致」に頼らないための唯一の出所。 */
  private readonly socketBindings = new Map<string, SocketBinding>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  createRoom(rawName: unknown): StoreResult<{ room: Room; player: RoomPlayer; rawReconnectToken: string }> {
    const name = normalizeName(rawName);
    if (!name.ok) {
      return fail(name.code, name.message);
    }

    this.purgeStaleRooms();

    const code = this.generateCode();
    if (code === null) {
      return fail('ROOM_CODE_EXHAUSTED', 'ルームを作成できませんでした。時間をおいて再試行してください');
    }

    const { player, rawToken } = this.createPlayer(name.value, true);
    const room: Room = { code, status: 'lobby', players: [player], emptySince: null };
    this.rooms.set(code, room);

    return { ok: true, value: { room, player, rawReconnectToken: rawToken } };
  }

  joinRoom(rawCode: unknown, rawName: unknown): StoreResult<{ room: Room; player: RoomPlayer; rawReconnectToken: string }> {
    const name = normalizeName(rawName);
    if (!name.ok) {
      return fail(name.code, name.message);
    }

    this.purgeStaleRooms();

    const room = this.rooms.get(normalizeCode(rawCode));
    if (room === undefined) {
      return fail('ROOM_NOT_FOUND', 'そのルームコードのルームは見つかりません');
    }
    if (room.status !== 'lobby') {
      return fail('ROOM_ALREADY_STARTED', 'そのルームはすでに開始しています');
    }
    if (room.players.length >= MAX_PLAYERS) {
      return fail('ROOM_FULL', `ルームの定員(${MAX_PLAYERS}人)に達しています`);
    }

    const { player, rawToken } = this.createPlayer(name.value, false);
    room.players.push(player);
    room.emptySince = null;

    return { ok: true, value: { room, player, rawReconnectToken: rawToken } };
  }

  reconnect(rawCode: unknown, rawToken: unknown): StoreResult<{ room: Room; player: RoomPlayer; rawReconnectToken: string }> {
    const room = this.rooms.get(normalizeCode(rawCode));
    if (room === undefined) {
      return fail('ROOM_NOT_FOUND', 'そのルームコードのルームは見つかりません');
    }

    if (typeof rawToken !== 'string' || rawToken.length === 0) {
      return fail('INVALID_TOKEN', '再接続トークンが不正です');
    }

    const tokenHash = hashReconnectToken(rawToken);
    const player = room.players.find((p) => p.reconnectTokenHash === tokenHash);
    if (player === undefined) {
      return fail('INVALID_TOKEN', '再接続できませんでした。ルームコードから参加し直してください');
    }

    room.emptySince = null;

    return { ok: true, value: { room, player, rawReconnectToken: rawToken } };
  }

  /** durable snapshotから復元したRoomを、process内のin-memory Mapへ直接挿入する。 */
  hydrateRoom(room: Room): void {
    if (this.rooms.has(room.code)) {
      return;
    }
    room.emptySince = this.now();
    this.rooms.set(room.code, room);
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(normalizeCode(code));
  }

  isSocketBound(socketId: string): boolean {
    return this.socketBindings.has(socketId);
  }

  getBySocket(socketId: string): { room: Room; player: RoomPlayer } | null {
    const binding = this.socketBindings.get(socketId);
    if (binding === undefined) {
      return null;
    }

    const room = this.rooms.get(binding.code);
    if (room === undefined) {
      return null;
    }

    const player = room.players.find((p) => p.id === binding.playerId);
    if (player === undefined) {
      return null;
    }

    return { room, player };
  }

  attachSocket(room: Room, player: RoomPlayer, socketId: string): { previousSocketId: string | null } {
    const previousSocketId = player.socketId;

    if (previousSocketId !== null && previousSocketId !== socketId) {
      this.socketBindings.delete(previousSocketId);
    }

    player.socketId = socketId;
    this.socketBindings.set(socketId, { code: room.code, playerId: player.id });
    room.emptySince = null;

    return { previousSocketId: previousSocketId !== socketId ? previousSocketId : null };
  }

  detachSocket(socketId: string): { room: Room; player: RoomPlayer } | null {
    const binding = this.socketBindings.get(socketId);
    if (binding === undefined) {
      return null;
    }

    this.socketBindings.delete(socketId);

    const room = this.rooms.get(binding.code);
    if (room === undefined) {
      return null;
    }

    const player = room.players.find((p) => p.id === binding.playerId);
    if (player === undefined) {
      return null;
    }

    if (player.socketId === socketId) {
      player.socketId = null;
    }

    this.refreshEmptySince(room);

    return { room, player };
  }

  /** 明示的な退出(lobby)。再接続の余地なくプレイヤーを削除する。ゲーム開始後はここを呼ばない。 */
  leave(room: Room, player: RoomPlayer): void {
    if (player.socketId !== null) {
      this.socketBindings.delete(player.socketId);
      player.socketId = null;
    }

    room.players = room.players.filter((p) => p.id !== player.id);

    if (room.players.length === 0) {
      this.rooms.delete(room.code);
      return;
    }

    if (player.isHost) {
      const next = room.players[0];
      if (next !== undefined) {
        next.isHost = true;
      }
    }

    this.refreshEmptySince(room);
  }

  /** 全員へ配ってよい形。reconnectToken は含めない。 */
  toPublicRoomState(room: Room): PublicRoomState {
    return {
      code: room.code,
      status: room.status,
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        connected: p.socketId !== null,
      })),
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
    };
  }

  roomCount(): number {
    return this.rooms.size;
  }

  playingPlayerCount(): number {
    let total = 0;
    for (const room of this.rooms.values()) {
      if (room.status === 'playing') {
        total += room.players.length;
      }
    }
    return total;
  }

  private createPlayer(name: string, isHost: boolean): { player: RoomPlayer; rawToken: string } {
    const rawToken = randomBytes(24).toString('base64url');
    const player: RoomPlayer = {
      id: randomUUID(),
      name,
      isHost,
      reconnectTokenHash: hashReconnectToken(rawToken),
      socketId: null,
    };
    return { player, rawToken };
  }

  private refreshEmptySince(room: Room): void {
    const anyConnected = room.players.some((p) => p.socketId !== null);
    room.emptySince = anyConnected ? null : this.now();
  }

  /** 誰も接続していないまま TTL を過ぎたルームを破棄する。create/joinのたびに走らせる。 */
  private purgeStaleRooms(): void {
    const limit = this.now() - EMPTY_ROOM_TTL_MS;

    for (const [code, room] of this.rooms) {
      if (room.emptySince !== null && room.emptySince < limit) {
        this.rooms.delete(code);
      }
    }
  }

  private generateCode(): string | null {
    for (let attempt = 0; attempt < 100; attempt++) {
      const bytes = randomBytes(CODE_LENGTH);
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) {
        code += CODE_ALPHABET[(bytes[i] as number) % CODE_ALPHABET.length];
      }

      if (!this.rooms.has(code)) {
        return code;
      }
    }

    return null;
  }
}
