/**
 * ラウンドの5分タイマーをサーバー側で強制する。クライアントが何も送らなくても、
 * `roundEndsAt`を過ぎたら自動的にラウンドを終了させる。
 */

import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/types.js';
import { finishRoundIfReady } from '../../shared/game/engine.js';
import type { RoundPhase } from '../../shared/game/state.js';
import type { GameManager } from './gameManager.js';
import type { RoomStore } from '../rooms/roomStore.js';
import type { RoomRepository } from '../persistence/roomRepository.js';
import { buildRoomSnapshot } from '../persistence/roomSnapshot.js';
import { toPublicGameState } from '../../shared/game/publicState.js';
import { toHandsView } from '../../shared/game/handsView.js';

type AppServer = Server<ClientToServerEvents, ServerToClientEvents>;

export const DEFAULT_ROUND_TIMER_TICK_MS = 1000;

/** 定期的に全roomを確認し、タイムアウトしたラウンドを強制終了させる。停止用の関数を返す。 */
export function startRoundTimerWatcher(
  io: AppServer,
  store: RoomStore,
  gameManager: GameManager,
  repository: RoomRepository,
  tickMs: number = DEFAULT_ROUND_TIMER_TICK_MS,
): () => void {
  const interval = setInterval(() => {
    for (const code of gameManager.activeGameCodes()) {
      const room = store.getRoom(code);
      const state = gameManager.getGame(code);
      if (room === undefined || state === undefined) {
        continue;
      }
      if (state.phase !== 'round_active' || state.roundEndsAt === null) {
        continue;
      }
      if (Date.now() < state.roundEndsAt) {
        continue;
      }

      const summary = finishRoundIfReady(state, gameManager.getRng(), Date.now(), true);
      if (summary === null) {
        continue;
      }

      repository.save(room.code, buildRoomSnapshot(room, state, Date.now())).catch((err: unknown) => {
        console.error(`[persistence] failed to save room ${room.code}:`, err);
      });

      io.to(room.code).emit('game:round:resolved', summary);
      io.to(room.code).emit('game:state', toPublicGameState(state));
      if ((state.phase as RoundPhase) === 'game_end' && state.winnerIds !== null) {
        io.to(room.code).emit('game:ended', { winnerIds: state.winnerIds });
      }
      for (const player of room.players) {
        if (player.socketId === null) {
          continue;
        }
        io.to(player.socketId).emit('game:handsView', toHandsView(state, player.id));
      }
    }
  }, tickMs);

  interval.unref?.();
  return () => clearInterval(interval);
}
