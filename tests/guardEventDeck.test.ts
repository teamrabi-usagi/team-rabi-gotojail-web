import { describe, expect, it } from 'vitest';
import { buildGuardEventDeck, drawGuardEventCard } from '../src/shared/rules/guardEventDeck.js';
import type { PlayerCount } from '../src/shared/types.js';
import { seededRng } from './rng.js';

describe('buildGuardEventDeck', () => {
  it('builds 2n cards: one right + one left per prisoner number 1..n', () => {
    for (const n of [2, 3, 4, 5] as const satisfies readonly PlayerCount[]) {
      const deck = buildGuardEventDeck(n, seededRng(1));
      expect(deck.drawPile).toHaveLength(2 * n);
      expect(deck.discardPile).toHaveLength(0);

      for (let prisonerNumber = 1; prisonerNumber <= n; prisonerNumber++) {
        const forThisPrisoner = deck.drawPile.filter((c) => c.prisonerNumber === prisonerNumber);
        expect(forThisPrisoner).toHaveLength(2);
        expect(new Set(forThisPrisoner.map((c) => c.direction))).toEqual(new Set(['left', 'right']));
      }
    }
  });
});

describe('drawGuardEventCard', () => {
  it('draws one card, moving it from drawPile to discardPile', () => {
    const deck = buildGuardEventDeck(3, seededRng(2));
    const { card, deck: next } = drawGuardEventCard(deck, seededRng(3));
    expect(next.drawPile).toHaveLength(deck.drawPile.length - 1);
    expect(next.discardPile).toHaveLength(1);
    expect(next.discardPile[0]).toEqual(card);
  });

  it('reshuffles the discard pile back into the draw pile once exhausted', () => {
    let deck = buildGuardEventDeck(2, seededRng(4));
    const rng = seededRng(5);
    const drawn = [];
    for (let i = 0; i < 4; i++) {
      const result = drawGuardEventCard(deck, rng);
      drawn.push(result.card);
      deck = result.deck;
    }
    expect(deck.drawPile).toHaveLength(0);
    expect(deck.discardPile).toHaveLength(4);

    // one more draw: should reshuffle discard -> draw automatically instead of throwing.
    const afterReshuffle = drawGuardEventCard(deck, rng);
    expect(afterReshuffle.deck.drawPile).toHaveLength(3);
    expect(afterReshuffle.deck.discardPile).toHaveLength(1);
  });

  it('throws only if both piles are truly empty (should never happen with a valid deck)', () => {
    expect(() => drawGuardEventCard({ drawPile: [], discardPile: [] }, seededRng(6))).toThrow();
  });
});
