/**
 * 1人のプレイヤーの「めくり」進行の純粋ロジック(bust/stop/ラッキーボーナス消費)。
 * 典拠: docs/RULE_SPEC.md §ゲームの進行 / §ラッキーカード。
 */

import type { Card } from '../types.js';

export interface PlayerRoundProgress {
  /** 8枚(7枚のメインカード+ラッキー1枚、挿入後)。固定のめくり順。 */
  readonly hand: readonly Card[];
  readonly flippedCount: number;
  readonly busted: boolean;
  readonly bustedAtFlipIndex: number | null;
  readonly stopped: boolean;
  /** 直前にめくったのがラッキーカードで、まだボーナスが消費されていない。 */
  readonly luckyBonusPending: boolean;
  /** このラウンドで実際に捨てた安全カードの重み付き合計(通常1、ボーナス時2)。 */
  readonly weightedSafeCount: number;
}

export function createPlayerRoundProgress(hand: readonly Card[]): PlayerRoundProgress {
  return {
    hand,
    flippedCount: 0,
    busted: false,
    bustedAtFlipIndex: null,
    stopped: false,
    luckyBonusPending: false,
    weightedSafeCount: 0,
  };
}

export function canFlip(progress: PlayerRoundProgress): boolean {
  return !progress.busted && !progress.stopped && progress.flippedCount < progress.hand.length;
}

export type FlipOutcome = 'safe' | 'bomb';

export interface FlipResult {
  readonly progress: PlayerRoundProgress;
  readonly outcome: FlipOutcome;
  readonly flippedCard: Card;
}

export function flipNext(progress: PlayerRoundProgress): FlipResult {
  if (progress.busted || progress.stopped) {
    throw new Error('flipNext(): player has already busted or stopped');
  }
  if (progress.flippedCount >= progress.hand.length) {
    throw new Error('flipNext(): no cards left to flip');
  }

  const index = progress.flippedCount;
  const card = progress.hand[index] as Card;
  const flippedCount = progress.flippedCount + 1;

  if (card.kind === 'bomb') {
    return {
      progress: {
        ...progress,
        flippedCount,
        busted: true,
        bustedAtFlipIndex: index,
        luckyBonusPending: false,
      },
      outcome: 'bomb',
      flippedCard: card,
    };
  }

  // 安全側(plain/guard/lucky)のフリップ。直前にラッキーのボーナスが立っていれば2個分。
  const contribution = progress.luckyBonusPending ? 2 : 1;

  return {
    progress: {
      ...progress,
      flippedCount,
      weightedSafeCount: progress.weightedSafeCount + contribution,
      // このカード自身がラッキーなら、次の安全フリップのためにボーナスを立てる。
      luckyBonusPending: card.kind === 'lucky',
    },
    outcome: 'safe',
    flippedCard: card,
  };
}

export function stopFlipping(progress: PlayerRoundProgress): PlayerRoundProgress {
  if (progress.busted || progress.stopped) {
    throw new Error('stopFlipping(): player has already busted or stopped');
  }
  return { ...progress, stopped: true, luckyBonusPending: false };
}

/** 残っている(未オープンの)安全カードの枚数(ブランク+看守+ラッキー)。ラウンド勝者判定に使う。 */
export function remainingSafeCount(progress: PlayerRoundProgress): number {
  return progress.hand.slice(progress.flippedCount).filter((c) => c.kind !== 'bomb').length;
}
