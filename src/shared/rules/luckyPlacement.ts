/**
 * ラッキーカード挿入(round_setupサブフェーズ)の純粋ロジック。
 * 典拠: docs/RULE_SPEC.md §ラッキーカード / 実装上の前提1。
 *
 * 座席iのラッキーカードは座席(i+1)%nの手札(=7枚、安全側ソート済み)に挿入される。
 * 挿入位置は座席i(ラッキーカードの持ち主)が選ぶ。元の7枚が全爆弾だった場合のみ、
 * 先頭(position 0)への挿入が強制される。
 */

import type { Card, PlayerCount } from '../types.js';
import { isAllBombs } from './deck.js';

/** 7枚+1枚=8枚の並びに対する挿入スロット数(0..7の8箇所)。 */
export const INSERTION_SLOT_COUNT = 8;

export function luckyRecipientSeat(ownerSeat: number, n: PlayerCount): number {
  return (ownerSeat + 1) % n;
}

export function luckyOwnerSeat(recipientSeat: number, n: PlayerCount): number {
  return (recipientSeat - 1 + n) % n;
}

/** 強制挿入位置。全爆弾でなければnull(=自由に選べる)。 */
export function forcedPosition(sevenSortedCards: readonly Card[]): number | null {
  return isAllBombs(sevenSortedCards) ? 0 : null;
}

export function isValidInsertionPosition(position: number): boolean {
  return Number.isInteger(position) && position >= 0 && position < INSERTION_SLOT_COUNT;
}

/**
 * positionが、このsevenSortedCardsに対して許可されているかを判定する
 * (全爆弾なら0のみ許可、それ以外は0..7すべて許可)。
 */
export function isAllowedPosition(sevenSortedCards: readonly Card[], position: number): boolean {
  if (!isValidInsertionPosition(position)) {
    return false;
  }
  const forced = forcedPosition(sevenSortedCards);
  return forced === null || forced === position;
}

/** ラッキーカードをsevenSortedCardsのposition番目(挿入後配列でのindex)に挿入した8枚を返す。 */
export function insertLuckyCard(sevenSortedCards: readonly Card[], position: number): Card[] {
  if (!isAllowedPosition(sevenSortedCards, position)) {
    throw new Error(`insertLuckyCard(): position ${position} is not allowed for this hand`);
  }
  const result = [...sevenSortedCards];
  result.splice(position, 0, { kind: 'lucky', number: null });
  return result;
}
