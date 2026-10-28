/**
 * GameState全体の型とゲーム定数。
 * 典拠: docs/RULE_SPEC.md。
 */

import type { Card, NeighborDirection } from '../types.js';
import type { PlayerTokens } from '../rules/tokens.js';
import type { PlayerRoundProgress } from '../rules/flip.js';
import type { GuardEventDeckState } from '../rules/guardEventDeck.js';

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
  mainSeven: readonly Card[];
  /** このプレイヤーの手札に挿入するラッキーカードの位置。持ち主(別のプレイヤー)が決める。 */
  luckyPlacementPosition: number | null;
  /** ラッキー挿入後の8枚。挿入が済むまでnull(round_setup中)。 */
  hand: readonly Card[] | null;
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
  /** このラウンドで実際に配られていた8枚(めくっていなかった分も含む)。終了時の一斉公開演出専用。 */
  readonly finalHand: readonly Card[];
  /** このラウンド中に実際にめくっていた枚数。これより後ろは終了時に初公開される。 */
  readonly flippedCountAtEnd: number;
  readonly busted: boolean;
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

/**
 * 看守マーク付きカードをめくった瞬間に発生する、進行を一時停止させる強制イベント。
 * nullでない間、全員の`flip`/`stop`は拒否され、ラウンドタイマーも一時停止する
 * (`roundEndsAt`はnullのまま維持)。対象者が`respondToGuardEvent`で回答すると解消される。
 */
export interface PendingGuardEvent {
  readonly drawerPlayerId: string;
  readonly targetPlayerId: string;
  readonly targetPrisonerNumber: number;
  readonly neighborPlayerId: string;
  readonly direction: NeighborDirection;
  /** 一時停止した瞬間に残っていたミリ秒。再開時にこの値だけ`roundEndsAt`を伸ばす。 */
  readonly pausedRemainingMs: number;
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
  /** round_activeが始まった時点のepoch ms。round_active以外、または看守イベント中はnull。 */
  roundEndsAt: number | null;
  guardEventDeck: GuardEventDeckState;
  /** 看守マーク付きカードをめくった直後、対象者の回答待ちの間だけセットされる。 */
  pendingGuardEvent: PendingGuardEvent | null;
  /** game_endになるまでnull。同率優勝あり。 */
  winnerIds: readonly string[] | null;
}
