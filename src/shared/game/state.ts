/**
 * GameState全体の型とゲーム定数。
 * 典拠: docs/RULE_SPEC.md。
 */

import type { CardKind } from '../types.js';
import type { PlayerTokens } from '../rules/tokens.js';
import type { PlayerRoundProgress } from '../rules/flip.js';

export const TOTAL_ROUNDS = 4;
export const STARTING_ZONE1 = 25;
export const ROUND_TIMER_SECONDS = 300;

export type RoundPhase = 'round_setup' | 'round_active' | 'round_end' | 'game_end';

export interface PlayerGameState {
  readonly playerId: string;
  /** 座席(0..n-1)。ゲーム全体で固定。 */
  readonly seat: number;
  tokens: PlayerTokens;
  /** このプレイヤー自身に配られ、安全側ソート済みの7枚(ラッキー挿入前)。 */
  mainSeven: readonly CardKind[];
  /** このプレイヤーの手札に挿入するラッキーカードの位置。持ち主(別のプレイヤー)が決める。 */
  luckyPlacementPosition: number | null;
  /** ラッキー挿入後の8枚。挿入が済むまでnull(round_setup中)。 */
  hand: readonly CardKind[] | null;
  /** めくり進行。handが確定するまでnull。 */
  progress: PlayerRoundProgress | null;
}

export interface RoundResolvedPlayerSummary {
  readonly playerId: string;
  readonly zone1: number;
  readonly zone2: number;
  readonly safeFlipConversion: number;
  readonly roundWinnerBonusApplied: boolean;
  readonly antePayout: number;
}

export interface RoundResolvedSummary {
  readonly roundNo: number;
  readonly players: readonly RoundResolvedPlayerSummary[];
  readonly roundWinnerIds: readonly string[];
  readonly potBeforeSettlement: number;
  readonly bustOrder: readonly string[];
  readonly potCarryOver: number;
  readonly timerCarrySeconds: number;
  readonly timedOut: boolean;
}

export interface GameState {
  /** 座席順のplayerId配列(index=seat)。ゲーム全体で固定。 */
  readonly playerOrder: readonly string[];
  players: Record<string, PlayerGameState>;
  /** 1始まり。createGameState直後は1。 */
  roundNo: number;
  phase: RoundPhase;
  /** 中央の座(アンティ)。ラウンドをまたいで持ち越される。 */
  pot: number;
  /** 今ラウンドで実際にbustした順(playerId)。ラウンドごとにリセットする。 */
  bustOrder: string[];
  /** 今ラウンド開始時に使うカウントダウンの長さ(秒)。砂時計の持ち越しルールで変動する。 */
  roundTimerSeconds: number;
  /** round_activeが始まった時点のepoch ms。round_active以外はnull。 */
  roundEndsAt: number | null;
  /** game_endになるまでnull。同率優勝あり。 */
  winnerIds: readonly string[] | null;
}
