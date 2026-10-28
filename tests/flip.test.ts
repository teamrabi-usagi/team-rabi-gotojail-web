import { describe, expect, it } from 'vitest';
import {
  canFlip,
  createPlayerRoundProgress,
  flipNext,
  remainingSafeCount,
  stopFlipping,
} from '../src/shared/rules/flip.js';
import type { Card } from '../src/shared/types.js';
import { cards } from './cardHelpers.js';

describe('flipNext', () => {
  it('a plain safe card contributes 1 and does not arm the lucky bonus', () => {
    const progress = createPlayerRoundProgress(cards('plain', 'bomb'));
    const result = flipNext(progress);
    expect(result.outcome).toBe('safe');
    expect(result.flippedCard.kind).toBe('plain');
    expect(result.progress.weightedSafeCount).toBe(1);
    expect(result.progress.luckyBonusPending).toBe(false);
    expect(result.progress.flippedCount).toBe(1);
  });

  it('a bomb busts the player and records the flip index', () => {
    const progress = createPlayerRoundProgress(cards('plain', 'bomb'));
    const afterPlain = flipNext(progress).progress;
    const result = flipNext(afterPlain);
    expect(result.outcome).toBe('bomb');
    expect(result.progress.busted).toBe(true);
    expect(result.progress.bustedAtFlipIndex).toBe(1);
    expect(canFlip(result.progress)).toBe(false);
  });

  it('a lucky card contributes 1 itself and arms a x2 bonus for the next safe flip', () => {
    const hand: readonly Card[] = cards('lucky', 'plain', 'plain', 'bomb');
    let progress = createPlayerRoundProgress(hand);

    const afterLucky = flipNext(progress);
    expect(afterLucky.flippedCard.kind).toBe('lucky');
    expect(afterLucky.progress.weightedSafeCount).toBe(1);
    expect(afterLucky.progress.luckyBonusPending).toBe(true);
    progress = afterLucky.progress;

    const afterPlain = flipNext(progress);
    expect(afterPlain.flippedCard.kind).toBe('plain');
    expect(afterPlain.progress.weightedSafeCount).toBe(1 + 2); // bonus applied
    expect(afterPlain.progress.luckyBonusPending).toBe(false); // bonus consumed, not re-armed by plain
    progress = afterPlain.progress;

    const afterSecondPlain = flipNext(progress);
    expect(afterSecondPlain.progress.weightedSafeCount).toBe(1 + 2 + 1); // back to normal 1
  });

  it('the lucky bonus is lost (not refunded) if the very next flip is a bomb', () => {
    const hand: readonly Card[] = cards('lucky', 'bomb');
    const afterLucky = flipNext(createPlayerRoundProgress(hand));
    const afterBomb = flipNext(afterLucky.progress);
    expect(afterBomb.outcome).toBe('bomb');
    expect(afterBomb.progress.weightedSafeCount).toBe(1); // only the lucky card's own 1, no bonus ever applied
  });

  it('throws when flipping after bust', () => {
    const hand: readonly Card[] = cards('bomb');
    const busted = flipNext(createPlayerRoundProgress(hand)).progress;
    expect(() => flipNext(busted)).toThrow();
  });

  it('throws when flipping after stop', () => {
    const hand: readonly Card[] = cards('plain', 'plain');
    const stopped = stopFlipping(createPlayerRoundProgress(hand));
    expect(() => flipNext(stopped)).toThrow();
  });

  it('throws when there are no cards left to flip', () => {
    const hand: readonly Card[] = cards('plain');
    const afterAll = flipNext(createPlayerRoundProgress(hand)).progress;
    expect(() => flipNext(afterAll)).toThrow();
  });
});

describe('stopFlipping', () => {
  it('marks the player as stopped without penalizing already-flipped progress', () => {
    const hand: readonly Card[] = cards('plain', 'plain', 'bomb');
    const afterOne = flipNext(createPlayerRoundProgress(hand)).progress;
    const stopped = stopFlipping(afterOne);
    expect(stopped.stopped).toBe(true);
    expect(stopped.busted).toBe(false);
    expect(stopped.weightedSafeCount).toBe(1);
    expect(canFlip(stopped)).toBe(false);
  });
});

describe('remainingSafeCount', () => {
  it('counts only unflipped safe-type cards', () => {
    const hand: readonly Card[] = cards('plain', 'plain', 'lucky', 'bomb', 'bomb');
    let progress = createPlayerRoundProgress(hand);
    expect(remainingSafeCount(progress)).toBe(3);

    progress = flipNext(progress).progress; // flips 'plain'
    expect(remainingSafeCount(progress)).toBe(2);
  });

  it('is 0 once all safe cards have been flipped, even if bombs remain unflipped', () => {
    const hand: readonly Card[] = cards('plain', 'bomb', 'bomb');
    const progress = flipNext(createPlayerRoundProgress(hand)).progress;
    expect(remainingSafeCount(progress)).toBe(0);
  });
});
