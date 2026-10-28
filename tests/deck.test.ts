import { describe, expect, it } from 'vitest';
import {
  HIDDEN_COUNT,
  MAIN_HAND_SIZE,
  MAIN_POOL_BY_PLAYER_COUNT,
  dealMainPool,
  isAllBombs,
  mainPoolSizeFor,
  shuffle,
  sortSafeFirst,
} from '../src/shared/rules/deck.js';
import type { PlayerCount } from '../src/shared/types.js';
import { seededRng } from './rng.js';

const PLAYER_COUNTS: readonly PlayerCount[] = [2, 3, 4, 5];

describe('MAIN_POOL_BY_PLAYER_COUNT', () => {
  it('totals match plainSafe+guardSafe+bomb and 7*n+HIDDEN_COUNT for every player count', () => {
    for (const n of PLAYER_COUNTS) {
      const comp = MAIN_POOL_BY_PLAYER_COUNT[n];
      expect(comp.plainSafe + comp.guardSafe + comp.bomb).toBe(comp.total);
      expect(comp.total).toBe(MAIN_HAND_SIZE * n + HIDDEN_COUNT);
    }
  });

  it('guard-marked safe count is exactly 2*n', () => {
    for (const n of PLAYER_COUNTS) {
      expect(MAIN_POOL_BY_PLAYER_COUNT[n].guardSafe).toBe(2 * n);
    }
  });

  it('matches the exact numbers agreed in the design conversation', () => {
    expect(MAIN_POOL_BY_PLAYER_COUNT).toEqual({
      2: { total: 20, plainSafe: 8, guardSafe: 4, bomb: 8 },
      3: { total: 27, plainSafe: 10, guardSafe: 6, bomb: 11 },
      4: { total: 34, plainSafe: 12, guardSafe: 8, bomb: 14 },
      5: { total: 41, plainSafe: 15, guardSafe: 10, bomb: 16 },
    });
  });
});

describe('shuffle', () => {
  it('does not mutate the input array', () => {
    const input = [1, 2, 3, 4, 5];
    const rng = seededRng(42);
    const result = shuffle(input, rng);
    expect(input).toEqual([1, 2, 3, 4, 5]);
    expect(result).not.toBe(input);
    expect([...result].sort((a, b) => a - b)).toEqual(input);
  });

  it('is deterministic for a given seed', () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    const a = shuffle(input, seededRng(7));
    const b = shuffle(input, seededRng(7));
    expect(a).toEqual(b);
  });
});

describe('dealMainPool', () => {
  it('deals exactly MAIN_HAND_SIZE cards to each player and HIDDEN_COUNT hidden cards, for every player count', () => {
    for (const n of PLAYER_COUNTS) {
      const rng = seededRng(100 + n);
      const { hands, hidden } = dealMainPool(n, rng);

      expect(hands).toHaveLength(n);
      for (const hand of hands) {
        expect(hand).toHaveLength(MAIN_HAND_SIZE);
      }
      expect(hidden).toHaveLength(HIDDEN_COUNT);
    }
  });

  it('never leaks the exact composition of the pool (total kinds dealt+hidden matches the pool exactly)', () => {
    for (const n of PLAYER_COUNTS) {
      const rng = seededRng(200 + n);
      const { hands, hidden } = dealMainPool(n, rng);
      const allCards = [...hands.flat(), ...hidden];
      const comp = MAIN_POOL_BY_PLAYER_COUNT[n];

      expect(allCards).toHaveLength(mainPoolSizeFor(n));
      expect(allCards.filter((k) => k === 'plain')).toHaveLength(comp.plainSafe);
      expect(allCards.filter((k) => k === 'guard')).toHaveLength(comp.guardSafe);
      expect(allCards.filter((k) => k === 'bomb')).toHaveLength(comp.bomb);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = dealMainPool(5, seededRng(55));
    const b = dealMainPool(5, seededRng(55));
    expect(a).toEqual(b);
  });
});

describe('sortSafeFirst', () => {
  it('moves all bombs to the end while preserving relative order within each side', () => {
    const input = ['bomb', 'plain', 'bomb', 'guard', 'lucky', 'bomb'] as const;
    expect(sortSafeFirst(input)).toEqual(['plain', 'guard', 'lucky', 'bomb', 'bomb', 'bomb']);
  });

  it('is a no-op for an all-safe hand', () => {
    const input = ['plain', 'guard', 'plain'] as const;
    expect(sortSafeFirst(input)).toEqual(['plain', 'guard', 'plain']);
  });

  it('is a no-op for an all-bomb hand', () => {
    const input = ['bomb', 'bomb'] as const;
    expect(sortSafeFirst(input)).toEqual(['bomb', 'bomb']);
  });
});

describe('isAllBombs', () => {
  it('is true only when every card is a bomb and the hand is non-empty', () => {
    expect(isAllBombs(['bomb', 'bomb', 'bomb'])).toBe(true);
    expect(isAllBombs(['bomb', 'plain', 'bomb'])).toBe(false);
    expect(isAllBombs([])).toBe(false);
  });
});
