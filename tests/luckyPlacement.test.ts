import { describe, expect, it } from 'vitest';
import {
  INSERTION_SLOT_COUNT,
  forcedPosition,
  insertLuckyCard,
  isAllowedPosition,
  isValidInsertionPosition,
  luckyOwnerSeat,
  luckyRecipientSeat,
} from '../src/shared/rules/luckyPlacement.js';
import type { CardKind } from '../src/shared/types.js';

describe('luckyRecipientSeat / luckyOwnerSeat', () => {
  it('wraps around using (seat+1)%n, and is the exact inverse of luckyOwnerSeat', () => {
    for (const n of [2, 3, 4, 5] as const) {
      for (let seat = 0; seat < n; seat++) {
        const recipient = luckyRecipientSeat(seat, n);
        expect(recipient).toBe((seat + 1) % n);
        expect(luckyOwnerSeat(recipient, n)).toBe(seat);
      }
    }
  });

  it('the last seat wraps to seat 0', () => {
    expect(luckyRecipientSeat(4, 5)).toBe(0);
  });
});

describe('forcedPosition', () => {
  it('forces position 0 when the seven cards are all bombs', () => {
    const allBombs: CardKind[] = ['bomb', 'bomb', 'bomb', 'bomb', 'bomb', 'bomb', 'bomb'];
    expect(forcedPosition(allBombs)).toBe(0);
  });

  it('is null (free choice) for any hand with at least one safe card', () => {
    const mixed: CardKind[] = ['plain', 'bomb', 'bomb', 'bomb', 'bomb', 'bomb', 'bomb'];
    expect(forcedPosition(mixed)).toBeNull();
  });
});

describe('isValidInsertionPosition / isAllowedPosition', () => {
  const mixed: CardKind[] = ['plain', 'guard', 'bomb', 'bomb', 'bomb', 'bomb', 'bomb'];
  const allBombs: CardKind[] = ['bomb', 'bomb', 'bomb', 'bomb', 'bomb', 'bomb', 'bomb'];

  it('allows 0..7 (INSERTION_SLOT_COUNT slots) for a mixed hand', () => {
    expect(INSERTION_SLOT_COUNT).toBe(8);
    for (let p = 0; p < INSERTION_SLOT_COUNT; p++) {
      expect(isValidInsertionPosition(p)).toBe(true);
      expect(isAllowedPosition(mixed, p)).toBe(true);
    }
    expect(isValidInsertionPosition(-1)).toBe(false);
    expect(isValidInsertionPosition(8)).toBe(false);
    expect(isValidInsertionPosition(1.5)).toBe(false);
  });

  it('only allows position 0 for an all-bomb hand', () => {
    expect(isAllowedPosition(allBombs, 0)).toBe(true);
    for (let p = 1; p < INSERTION_SLOT_COUNT; p++) {
      expect(isAllowedPosition(allBombs, p)).toBe(false);
    }
  });
});

describe('insertLuckyCard', () => {
  it('inserts the lucky card at the given position, growing 7 cards to 8', () => {
    const seven: CardKind[] = ['plain', 'guard', 'plain', 'bomb', 'bomb', 'bomb', 'bomb'];
    const result = insertLuckyCard(seven, 2);
    expect(result).toEqual(['plain', 'guard', 'lucky', 'plain', 'bomb', 'bomb', 'bomb', 'bomb']);
    expect(result).toHaveLength(8);
    // does not mutate input
    expect(seven).toHaveLength(7);
  });

  it('inserting at position 0 puts the lucky card first', () => {
    const seven: CardKind[] = ['plain', 'bomb', 'bomb', 'bomb', 'bomb', 'bomb', 'bomb'];
    expect(insertLuckyCard(seven, 0)).toEqual(['lucky', 'plain', 'bomb', 'bomb', 'bomb', 'bomb', 'bomb', 'bomb']);
  });

  it('inserting at position 7 (end) puts the lucky card last', () => {
    const seven: CardKind[] = ['plain', 'bomb', 'bomb', 'bomb', 'bomb', 'bomb', 'bomb'];
    expect(insertLuckyCard(seven, 7)).toEqual(['plain', 'bomb', 'bomb', 'bomb', 'bomb', 'bomb', 'bomb', 'lucky']);
  });

  it('throws when the position is not allowed (forced-position violation)', () => {
    const allBombs: CardKind[] = ['bomb', 'bomb', 'bomb', 'bomb', 'bomb', 'bomb', 'bomb'];
    expect(() => insertLuckyCard(allBombs, 3)).toThrow();
  });

  it('throws for an out-of-range position', () => {
    const seven: CardKind[] = ['plain', 'bomb', 'bomb', 'bomb', 'bomb', 'bomb', 'bomb'];
    expect(() => insertLuckyCard(seven, 8)).toThrow();
    expect(() => insertLuckyCard(seven, -1)).toThrow();
  });
});
