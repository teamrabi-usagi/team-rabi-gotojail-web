/**
 * ルームごとのゲームセッション管理。
 *
 * `RoomStore`(lobby/room管理)と`src/shared/game/engine.ts`(ゲームルールの純粋ロジック)の
 * 橋渡し。host判定・人数制約・lobbyからの開始条件など「ルームに関する権限確認」はここに置き、
 * ルールそのものはengine.tsから動かさない。
 */

import type { Rng } from '../../shared/types.js';
import {
  createGameState,
  flipCard,
  stop,
  submitLuckyPlacement,
  type EngineResult,
  type FlipCardResult,
  type StopResult,
} from '../../shared/game/engine.js';
import type { GameState } from '../../shared/game/state.js';
import { MAX_PLAYERS, MIN_PLAYERS, type Room, type StoreResult } from '../rooms/roomStore.js';

function fail<T>(code: string, message: string): StoreResult<T> {
  return { ok: false, code, message };
}

export class GameManager {
  private readonly games = new Map<string, GameState>();

  /** 乱数源。テストでは決定的な関数を差し替えられるようにしておく。 */
  constructor(private readonly rng: Rng = Math.random) {}

  /** roundTimer.tsなど、GameManager外からも同じ乱数源を使う必要がある箇所用。 */
  getRng(): Rng {
    return this.rng;
  }

  getGame(code: string): GameState | undefined {
    return this.games.get(code);
  }

  /** 現在ゲームが進行中(status='playing')のroom codeを全て返す。roundTimer.tsが使う。 */
  activeGameCodes(): readonly string[] {
    return [...this.games.keys()];
  }

  /** durable snapshotから復元したGameStateを、process内のin-memory Mapへ直接挿入する(Phase 5)。 */
  hydrateGame(code: string, state: GameState): void {
    if (this.games.has(code)) {
      return;
    }
    this.games.set(code, state);
  }

  /** ゲーム開始。hostのみ・lobby中のみ・2〜5人のみ・二重開始不可。 */
  startGame(room: Room, requestingPlayerId: string): StoreResult<GameState> {
    if (room.status !== 'lobby') {
      return fail('INVALID_PHASE', 'このルームはすでに開始しているか終了しています');
    }

    const requester = room.players.find((p) => p.id === requestingPlayerId);
    if (requester === undefined || !requester.isHost) {
      return fail('NOT_HOST', 'ホストのみゲームを開始できます');
    }

    if (room.players.length < MIN_PLAYERS || room.players.length > MAX_PLAYERS) {
      return fail('INVALID_PLAYER_COUNT', `プレイヤー数は${MIN_PLAYERS}〜${MAX_PLAYERS}人である必要があります`);
    }

    const playerIds = room.players.map((p) => p.id);
    const state = createGameState(playerIds, this.rng);

    this.games.set(room.code, state);
    room.status = 'playing';

    return { ok: true, value: state };
  }

  submitLuckyPlacement(room: Room, ownerPlayerId: string, position: number, now: number = Date.now()): EngineResult {
    const state = this.games.get(room.code);
    if (state === undefined) {
      return { ok: false, code: 'NO_GAME', message: 'このルームはまだゲームを開始していません' };
    }
    return submitLuckyPlacement(state, ownerPlayerId, position, now);
  }

  flipCard(room: Room, playerId: string, now: number = Date.now()): FlipCardResult {
    const state = this.games.get(room.code);
    if (state === undefined) {
      return { ok: false, code: 'NO_GAME', message: 'このルームはまだゲームを開始していません' };
    }
    return flipCard(state, playerId, this.rng, now);
  }

  stop(room: Room, playerId: string, now: number = Date.now()): StopResult {
    const state = this.games.get(room.code);
    if (state === undefined) {
      return { ok: false, code: 'NO_GAME', message: 'このルームはまだゲームを開始していません' };
    }
    return stop(state, playerId, this.rng, now);
  }
}
