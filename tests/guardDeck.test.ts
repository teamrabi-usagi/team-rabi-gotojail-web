import { describe, expect, it } from 'vitest';
import { buildGuardDeck, drawGuardCard } from '../src/shared/rules/guardDeck.js';
import { seededRng } from './rng.js';

describe('buildGuardDeck', () => {
  it('builds exactly n cards, one per prisoner number 1..n, with an empty discard pile', () => {
    for (const n of [2, 3, 4, 5] as const) {
      const deck = buildGuardDeck(n, seededRng(1));
      expect(deck.drawPile).toHaveLength(n);
      expect(deck.discardPile).toHaveLength(0);
      const prisonerNumbers = deck.drawPile.map((c) => c.prisonerNumber).sort((a, b) => a - b);
      expect(prisonerNumbers).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    }
  });
});

describe('drawGuardCard', () => {
  it('draws the top card and moves it to the discard pile', () => {
    const deck = buildGuardDeck(3, seededRng(2));
    const [topCard] = deck.drawPile;
    const { card, deck: nextDeck } = drawGuardCard(deck, seededRng(99));

    expect(card).toEqual(topCard);
    expect(nextDeck.drawPile).toHaveLength(2);
    expect(nextDeck.discardPile).toHaveLength(1);
    expect(nextDeck.discardPile.at(0)).toEqual(topCard);
  });

  it('reshuffles the discard pile back into the draw pile once the draw pile is empty', () => {
    let deck = buildGuardDeck(2, seededRng(3));
    const drawnCards = [];

    for (let i = 0; i < 2; i++) {
      const result = drawGuardCard(deck, seededRng(10 + i));
      drawnCards.push(result.card);
      deck = result.deck;
    }
    expect(deck.drawPile).toHaveLength(0);
    expect(deck.discardPile).toHaveLength(2);

    // draw pile is empty, discard has 2: should reshuffle and draw successfully
    const { card, deck: nextDeck } = drawGuardCard(deck, seededRng(42));
    expect(drawnCards.map((c) => c.prisonerNumber)).toContain(card.prisonerNumber);
    expect(nextDeck.drawPile).toHaveLength(1);
    expect(nextDeck.discardPile).toHaveLength(1);
  });

  it('throws if both piles are empty (should never happen in practice for n>=2)', () => {
    expect(() => drawGuardCard({ drawPile: [], discardPile: [] }, seededRng(1))).toThrow();
  });
});
