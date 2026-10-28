/**
 * 看守デッキ(今回は「没収」カードのみ)の純粋ロジック。
 * 典拠: docs/RULE_SPEC.md §看守カード / 実装上の前提2。
 *
 * 人数分(n枚、囚人番号1..nが1枚ずつ)のデッキとし、尽きたら捨て札を
 * シャッフルして山札に戻す。
 */

import type { PlayerCount, Rng } from '../types.js';
import { shuffle } from './deck.js';

export interface GuardCard {
  readonly prisonerNumber: number;
}

export interface GuardDeckState {
  readonly drawPile: readonly GuardCard[];
  readonly discardPile: readonly GuardCard[];
}

export function buildGuardDeck(n: PlayerCount, rng: Rng): GuardDeckState {
  const cards: GuardCard[] = [];
  for (let prisonerNumber = 1; prisonerNumber <= n; prisonerNumber++) {
    cards.push({ prisonerNumber });
  }
  return { drawPile: shuffle(cards, rng), discardPile: [] };
}

export interface DrawGuardCardResult {
  readonly card: GuardCard;
  readonly deck: GuardDeckState;
}

/** 山札が尽きていたら捨て札をシャッフルして山札にしてから1枚引く。 */
export function drawGuardCard(deck: GuardDeckState, rng: Rng): DrawGuardCardResult {
  if (deck.drawPile.length === 0) {
    if (deck.discardPile.length === 0) {
      throw new Error('drawGuardCard(): deck and discard pile are both empty');
    }
    const reshuffled = shuffle(deck.discardPile, rng);
    return drawGuardCard({ drawPile: reshuffled, discardPile: [] }, rng);
  }

  const [card, ...restDrawPile] = deck.drawPile;
  const drawnCard = card as GuardCard;
  return {
    card: drawnCard,
    deck: { drawPile: restDrawPile, discardPile: [...deck.discardPile, drawnCard] },
  };
}
