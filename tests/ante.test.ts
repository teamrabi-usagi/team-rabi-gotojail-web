import { describe, expect, it } from 'vitest';
import { anteAmountPerPlayer, anteTotalFor, settleBustPayouts } from '../src/shared/rules/ante.js';

describe('anteAmountPerPlayer / anteTotalFor', () => {
  it('is 2 tokens per player', () => {
    expect(anteAmountPerPlayer()).toBe(2);
  });

  it('totals 2*n for every player count', () => {
    for (const n of [2, 3, 4, 5] as const) {
      expect(anteTotalFor(n)).toBe(2 * n);
    }
  });
});

describe('settleBustPayouts', () => {
  it('pays the first buster ceil(pot/2), rounding up, cascading down the bust order (5p, pot=10)', () => {
    const result = settleBustPayouts(10, ['a', 'b', 'c']);
    // 10 -> a gets ceil(10/2)=5, remain 5
    // 5 -> b gets ceil(5/2)=3, remain 2
    // 2 -> c gets ceil(2/2)=1, remain 1
    expect(result.payouts).toEqual([
      { playerId: 'a', amount: 5 },
      { playerId: 'b', amount: 3 },
      { playerId: 'c', amount: 1 },
    ]);
    expect(result.potRemaining).toBe(1);
  });

  it('matches the hand-worked odd-pot example from the design conversation (pot=5)', () => {
    const result = settleBustPayouts(5, ['a', 'b', 'c', 'd']);
    // 5 -> a: ceil(5/2)=3, remain 2
    // 2 -> b: ceil(2/2)=1, remain 1
    // 1 -> c: ceil(1/2)=1, remain 0
    // 0 -> loop breaks before d
    expect(result.payouts).toEqual([
      { playerId: 'a', amount: 3 },
      { playerId: 'b', amount: 1 },
      { playerId: 'c', amount: 1 },
    ]);
    expect(result.potRemaining).toBe(0);
  });

  it('pays nobody and carries the full pot over when nobody busted', () => {
    const result = settleBustPayouts(10, []);
    expect(result.payouts).toEqual([]);
    expect(result.potRemaining).toBe(10);
  });

  it('stops once the pot is exhausted even if more bust-order entries remain', () => {
    const result = settleBustPayouts(1, ['a', 'b', 'c']);
    expect(result.payouts).toEqual([{ playerId: 'a', amount: 1 }]);
    expect(result.potRemaining).toBe(0);
  });
});
