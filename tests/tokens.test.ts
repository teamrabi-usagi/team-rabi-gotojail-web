import { describe, expect, it } from 'vitest';
import { createInitialTokens, moveZone1ToZone2, payAnte, receiveAntePayout } from '../src/shared/rules/tokens.js';

describe('createInitialTokens', () => {
  it('starts with zone1=startingZone1, zone2=0', () => {
    expect(createInitialTokens(25)).toEqual({ zone1: 25, zone2: 0 });
  });
});

describe('moveZone1ToZone2', () => {
  it('moves amount from zone1 to zone2', () => {
    expect(moveZone1ToZone2({ zone1: 25, zone2: 0 }, 5)).toEqual({ zone1: 20, zone2: 5 });
  });

  it('accumulates zone2 across multiple calls', () => {
    const after1 = moveZone1ToZone2({ zone1: 25, zone2: 0 }, 5);
    const after2 = moveZone1ToZone2(after1, 3);
    expect(after2).toEqual({ zone1: 17, zone2: 8 });
  });

  it('clamps at 0 and never goes negative even if amount exceeds zone1 (defensive floor)', () => {
    expect(moveZone1ToZone2({ zone1: 2, zone2: 0 }, 5)).toEqual({ zone1: 0, zone2: 2 });
  });
});

describe('receiveAntePayout', () => {
  it('adds amount to zone1 (penalty), leaves zone2 untouched', () => {
    expect(receiveAntePayout({ zone1: 20, zone2: 5 }, 3)).toEqual({ zone1: 23, zone2: 5 });
  });

  it('is a no-op for amount<=0', () => {
    expect(receiveAntePayout({ zone1: 20, zone2: 5 }, 0)).toEqual({ zone1: 20, zone2: 5 });
  });
});

describe('payAnte', () => {
  it('moves amount out of zone1 (into the shared pot, tracked elsewhere)', () => {
    expect(payAnte({ zone1: 25, zone2: 0 }, 2)).toEqual({ zone1: 23, zone2: 0 });
  });

  it('clamps at 0 if zone1 is less than the ante amount', () => {
    expect(payAnte({ zone1: 1, zone2: 0 }, 2)).toEqual({ zone1: 0, zone2: 0 });
  });
});
