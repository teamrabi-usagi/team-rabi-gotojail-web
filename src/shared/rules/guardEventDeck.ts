/**
 * 看守イベントデッキ(看守マーク付きカードをめくった瞬間に1枚引くカード)の純粋ロジック。
 * 典拠: ユーザーとの会話で確定した仕様(Notion ver2の「看守カード(案)」の具体化)。
 *
 * n人なら、各座席の「囚人番号i(1..n)」について「右隣」「左隣」の2種類ずつ、
 * 合計2n枚のデッキとする。山札が尽きたら捨て札をシャッフルして山札に戻す。
 */

import type { NeighborDirection, PlayerCount, Rng } from '../types.js';
import { shuffle } from './deck.js';

export interface GuardEventCard {
  readonly prisonerNumber: number;
  readonly direction: NeighborDirection;
}

export interface GuardEventDeckState {
  readonly drawPile: readonly GuardEventCard[];
  readonly discardPile: readonly GuardEventCard[];
}

export function buildGuardEventDeck(n: PlayerCount, rng: Rng): GuardEventDeckState {
  const cards: GuardEventCard[] = [];
  for (let prisonerNumber = 1; prisonerNumber <= n; prisonerNumber++) {
    cards.push({ prisonerNumber, direction: 'right' });
    cards.push({ prisonerNumber, direction: 'left' });
  }
  return { drawPile: shuffle(cards, rng), discardPile: [] };
}

export interface DrawGuardEventCardResult {
  readonly card: GuardEventCard;
  readonly deck: GuardEventDeckState;
}

/** 山札が尽きていたら捨て札をシャッフルして山札にしてから1枚引く。 */
export function drawGuardEventCard(deck: GuardEventDeckState, rng: Rng): DrawGuardEventCardResult {
  if (deck.drawPile.length === 0) {
    if (deck.discardPile.length === 0) {
      throw new Error('drawGuardEventCard(): deck and discard pile are both empty');
    }
    const reshuffled = shuffle(deck.discardPile, rng);
    return drawGuardEventCard({ drawPile: reshuffled, discardPile: [] }, rng);
  }

  const [card, ...restDrawPile] = deck.drawPile;
  const drawnCard = card as GuardEventCard;
  return {
    card: drawnCard,
    deck: { drawPile: restDrawPile, discardPile: [...deck.discardPile, drawnCard] },
  };
}
