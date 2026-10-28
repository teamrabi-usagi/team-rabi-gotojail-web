/**
 * GameState -> クライアントへ送ってよい公開情報への変換(sanitizer層)。
 * カード種別データ(自分/他人の手札の内容)は一切含めない -- それは handsView.ts の責務。
 */

import { TOTAL_ROUNDS, type GameState, type RoundPhase } from './state.js';
import { pendingLuckyPlacementOwners } from './engine.js';

export interface PublicPlayerGameState {
  readonly playerId: string;
  readonly seat: number;
  readonly zone1: number;
  readonly zone2: number;
}

export interface PublicGameState {
  readonly roundNo: number;
  readonly totalRounds: number;
  readonly phase: RoundPhase;
  readonly pot: number;
  readonly players: readonly PublicPlayerGameState[];
  readonly bustOrder: readonly string[];
  readonly roundTimerSeconds: number;
  readonly roundEndsAt: number | null;
  readonly winnerIds: readonly string[] | null;
  /** round_setup中、まだ自分の担当(相手へのラッキー挿入)を終えていないplayerId一覧。 */
  readonly pendingLuckyPlacementOwners: readonly string[];
}

export function toPublicGameState(state: GameState): PublicGameState {
  return {
    roundNo: state.roundNo,
    totalRounds: TOTAL_ROUNDS,
    phase: state.phase,
    pot: state.pot,
    players: state.playerOrder.map((id) => {
      const p = state.players[id];
      return {
        playerId: id,
        seat: p?.seat ?? 0,
        zone1: p?.tokens.zone1 ?? 0,
        zone2: p?.tokens.zone2 ?? 0,
      };
    }),
    bustOrder: state.bustOrder,
    roundTimerSeconds: state.roundTimerSeconds,
    roundEndsAt: state.roundEndsAt,
    winnerIds: state.winnerIds,
    pendingLuckyPlacementOwners: pendingLuckyPlacementOwners(state),
  };
}
