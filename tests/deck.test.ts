import { describe, expect, it } from 'vitest';
import {
  HIDDEN_COUNT,
  MAIN_HAND_SIZE,
  MAIN_POOL_BY_PLAYER_COUNT,
  dealMainPool,
  distributeSafeNumbers,
  isAllBombs,
  mainPoolSizeFor,
  shuffle,
  sortSafeFirst,
} from '../src/shared/rules/deck.js';
import type { PlayerCount } from '../src/shared/types.js';
import { seededRng } from './rng.js';
import { card } from './cardHelpers.js';

const PLAYER_COUNTS: readonly PlayerCount[] = [2, 3, 4, 5];

describe('MAIN_POOL_BY_PLAYER_COUNT', () => {
  it('totals match plainSafe+guardSafe+bomb and 7*n+HIDDEN_COUNT for every player count', () => {
    for (const n of PLAYER_COUNTS) {
      const comp = MAIN_POOL_BY_PLAYER_COUNT[n];
      expect(comp.plainSafe + comp.guardSafe + comp.bomb).toBe(comp.total);
      expect(comp.total).toBe(MAIN_HAND_SIZE * n + HIDDEN_COUNT);
    }
  });

  it('guard cards are only used from 3 players up, and are always exactly 5 (one per number) when used', () => {
    expect(MAIN_POOL_BY_PLAYER_COUNT[2].guardSafe).toBe(0);
    expect(MAIN_POOL_BY_PLAYER_COUNT[3].guardSafe).toBe(5);
    expect(MAIN_POOL_BY_PLAYER_COUNT[4].guardSafe).toBe(5);
    expect(MAIN_POOL_BY_PLAYER_COUNT[5].guardSafe).toBe(5);
  });

  it('matches the exact numbers agreed in the design conversation (safe:bomb ~= 1:1)', () => {
    expect(MAIN_POOL_BY_PLAYER_COUNT).toEqual({
      2: { total: 20, plainSafe: 10, guardSafe: 0, bomb: 10 },
      3: { total: 27, plainSafe: 8, guardSafe: 5, bomb: 14 },
      4: { total: 34, plainSafe: 12, guardSafe: 5, bomb: 17 },
      5: { total: 41, plainSafe: 15, guardSafe: 5, bomb: 21 },
    });
  });
});

describe('distributeSafeNumbers', () => {
  it('distributes as evenly as possible across 1..5, favoring lower numbers for the remainder', () => {
    expect(distributeSafeNumbers(12)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect(distributeSafeNumbers(15)).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5]);
  });

  it('always produces exactly `count` numbers, each within 1..5', () => {
    for (const count of [11, 12, 15, 20]) {
      const result = distributeSafeNumbers(count);
      expect(result).toHaveLength(count);
      for (const n of result) {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(5);
      }
    }
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
      expect(allCards.filter((c) => c.kind === 'plain')).toHaveLength(comp.plainSafe);
      expect(allCards.filter((c) => c.kind === 'guard')).toHaveLength(comp.guardSafe);
      expect(allCards.filter((c) => c.kind === 'bomb')).toHaveLength(comp.bomb);
      // 看守カードが出る場合は必ず番号1〜5が1枚ずつ。
      if (comp.guardSafe > 0) {
        const guardNumbers = allCards.filter((c) => c.kind === 'guard').map((c) => c.number);
        expect([...guardNumbers].sort()).toEqual([1, 2, 3, 4, 5]);
      }
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
    const input = [card('bomb'), card('plain', 3), card('bomb'), card('lucky'), card('plain', 1), card('bomb')];
    // lucky has number=null (treated as 0), so it sorts after plain(1).
    expect(sortSafeFirst(input)).toEqual([card('plain', 3), card('plain', 1), card('lucky'), card('bomb'), card('bomb'), card('bomb')]);
  });

  it('orders the safe segment by number descending: farthest from the bomb (5) first, closest (1) last', () => {
    const input = [card('plain', 1), card('guard', 4), card('plain', 2), card('guard', 5), card('plain', 3), card('bomb')];
    const result = sortSafeFirst(input);
    expect(result.map((c) => c.number)).toEqual([5, 4, 3, 2, 1, null]);
    expect(result[result.length - 1]!.kind).toBe('bomb');
  });

  it('is a no-op (order-wise) for an all-safe hand with distinct numbers', () => {
    const input = [card('plain', 3), card('lucky'), card('plain', 1)];
    // luckyはnumber=nullなので0扱いで最後列に寄る。
    expect(sortSafeFirst(input)).toEqual([card('plain', 3), card('plain', 1), card('lucky')]);
  });

  it('is a no-op for an all-bomb hand', () => {
    const input = [card('bomb'), card('bomb')];
    expect(sortSafeFirst(input)).toEqual([card('bomb'), card('bomb')]);
  });
});

describe('isAllBombs', () => {
  it('is true only when every card is a bomb and the hand is non-empty', () => {
    expect(isAllBombs([card('bomb'), card('bomb'), card('bomb')])).toBe(true);
    expect(isAllBombs([card('bomb'), card('plain', 1), card('bomb')])).toBe(false);
    expect(isAllBombs([])).toBe(false);
  });
});
