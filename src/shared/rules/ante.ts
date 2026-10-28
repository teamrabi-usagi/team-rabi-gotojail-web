/**
 * 座(アンティ)の額・bust順払い出し・持ち越しの純粋ロジック。
 * 典拠: docs/RULE_SPEC.md §座(アンティ)。
 */

import type { PlayerCount } from '../types.js';

export function anteAmountPerPlayer(): number {
  return 2;
}

export function anteTotalFor(n: PlayerCount): number {
  return anteAmountPerPlayer() * n;
}

export interface BustPayout {
  readonly playerId: string;
  readonly amount: number;
}

export interface SettleBustPayoutsResult {
  readonly payouts: readonly BustPayout[];
  readonly potRemaining: number;
}

/**
 * bust順(実際にbustした実時間順)に、残っている座の切り上げ半分を受け取る。
 * 座が0になるか、bustOrderを使い切ったら終了する。bustしなかった人には何も渡らない。
 * 残った座(bustが0人の場合は全額)はそのまま次ラウンドへ持ち越す(呼び出し側の責務)。
 */
export function settleBustPayouts(potAtRoundStart: number, bustOrder: readonly string[]): SettleBustPayoutsResult {
  let remaining = potAtRoundStart;
  const payouts: BustPayout[] = [];

  for (const playerId of bustOrder) {
    if (remaining <= 0) {
      break;
    }
    const amount = Math.ceil(remaining / 2);
    payouts.push({ playerId, amount });
    remaining -= amount;
  }

  return { payouts, potRemaining: remaining };
}
