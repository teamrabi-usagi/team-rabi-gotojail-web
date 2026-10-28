import { describe, expect, it } from 'vitest';
import { createPlayerRoundProgress, flipNext, stopFlipping } from '../src/shared/rules/flip.js';
import { createInitialTokens } from '../src/shared/rules/tokens.js';
import { resolveRound, ROUND_WINNER_BONUS, type RoundPlayerInput } from '../src/shared/rules/roundResolution.js';
import type { CardKind } from '../src/shared/types.js';

function flipTimes(hand: readonly CardKind[], times: number) {
  let progress = createPlayerRoundProgress(hand);
  for (let i = 0; i < times; i++) {
    progress = flipNext(progress).progress;
  }
  return progress;
}

describe('resolveRound', () => {
  it('matches the worked example from the design conversation: 7 main cards, 5 safe, flip 4 then stop', () => {
    // hand sorted safe-first: 5 safe cards then 2 bombs (7 cards, no lucky card in this example)
    const hand: readonly CardKind[] = ['plain', 'plain', 'plain', 'plain', 'plain', 'bomb', 'bomb'];
    const progress = stopFlipping(flipTimes(hand, 4));

    const input: RoundPlayerInput = {
      playerId: 'p1',
      tokens: createInitialTokens(25),
      progress,
    };

    // sole survivor automatically has the fewest remaining safe cards, so the
    // round-winner bonus (+2) also applies on top of the 4-card conversion.
    const result = resolveRound([input], 0, []);
    const p1 = result.players.find((p) => p.playerId === 'p1');
    expect(p1?.safeFlipConversion).toBe(4);
    expect(p1?.roundWinnerBonusApplied).toBe(true);
    expect(p1?.tokens.zone1).toBe(25 - 4 - ROUND_WINNER_BONUS);
    expect(p1?.tokens.zone2).toBe(4 + ROUND_WINNER_BONUS);
  });

  it('isolates the pure safe-flip conversion (no round-winner bonus) when another survivor has fewer remaining safe cards', () => {
    const handP1: readonly CardKind[] = ['plain', 'plain', 'plain', 'plain', 'plain', 'bomb', 'bomb'];
    const handP2: readonly CardKind[] = ['plain', 'bomb']; // flips its only safe card, 0 remaining -> beats p1's 1 remaining

    const p1Progress = stopFlipping(flipTimes(handP1, 4)); // 1 safe card remains unflipped
    const p2Progress = stopFlipping(flipTimes(handP2, 1)); // 0 safe cards remain unflipped

    const inputs: RoundPlayerInput[] = [
      { playerId: 'p1', tokens: createInitialTokens(25), progress: p1Progress },
      { playerId: 'p2', tokens: createInitialTokens(25), progress: p2Progress },
    ];

    const result = resolveRound(inputs, 0, []);
    expect(result.roundWinnerIds).toEqual(['p2']);

    const p1 = result.players.find((p) => p.playerId === 'p1');
    expect(p1?.safeFlipConversion).toBe(4);
    expect(p1?.roundWinnerBonusApplied).toBe(false);
    expect(p1?.tokens.zone1).toBe(21);
    expect(p1?.tokens.zone2).toBe(4);
  });

  it('awards the round-winner bonus to the survivor with fewest remaining safe cards', () => {
    const handA: readonly CardKind[] = ['plain', 'plain', 'bomb']; // flips both plain, 0 remaining safe
    const handB: readonly CardKind[] = ['plain', 'plain', 'plain', 'bomb']; // flips one, 2 remaining safe

    const progressA = stopFlipping(flipTimes(handA, 2));
    const progressB = stopFlipping(flipTimes(handB, 1));

    const inputs: RoundPlayerInput[] = [
      { playerId: 'a', tokens: createInitialTokens(25), progress: progressA },
      { playerId: 'b', tokens: createInitialTokens(25), progress: progressB },
    ];

    const result = resolveRound(inputs, 0, []);
    expect(result.roundWinnerIds).toEqual(['a']);

    const a = result.players.find((p) => p.playerId === 'a')!;
    const b = result.players.find((p) => p.playerId === 'b')!;
    // a: 2 safe flips converted + ROUND_WINNER_BONUS
    expect(a.tokens.zone2).toBe(2 + ROUND_WINNER_BONUS);
    expect(a.roundWinnerBonusApplied).toBe(true);
    // b: 1 safe flip converted, no bonus
    expect(b.tokens.zone2).toBe(1);
    expect(b.roundWinnerBonusApplied).toBe(false);
  });

  it('ties are co-winners: both get the bonus', () => {
    const hand: readonly CardKind[] = ['plain', 'bomb'];
    const progressA = stopFlipping(flipTimes(hand, 1));
    const progressB = stopFlipping(flipTimes(hand, 1));

    const inputs: RoundPlayerInput[] = [
      { playerId: 'a', tokens: createInitialTokens(25), progress: progressA },
      { playerId: 'b', tokens: createInitialTokens(25), progress: progressB },
    ];

    const result = resolveRound(inputs, 0, []);
    expect(new Set(result.roundWinnerIds)).toEqual(new Set(['a', 'b']));
  });

  it('a busted player cannot be a round winner even with 0 remaining safe cards, but keeps pre-bust conversion', () => {
    const hand: readonly CardKind[] = ['plain', 'plain', 'bomb'];
    const progress = flipTimes(hand, 3); // flips both plain safely, then busts on the bomb

    const inputs: RoundPlayerInput[] = [{ playerId: 'busted', tokens: createInitialTokens(25), progress }];
    const result = resolveRound(inputs, 0, []);

    expect(result.roundWinnerIds).toEqual([]);
    const busted = result.players.find((p) => p.playerId === 'busted')!;
    expect(busted.safeFlipConversion).toBe(2);
    expect(busted.roundWinnerBonusApplied).toBe(false);
  });

  it('integrates ante settlement by bust order on top of the safe-flip and bonus conversions', () => {
    const hand: readonly CardKind[] = ['bomb'];
    const progressA = flipTimes(hand, 1); // busts immediately
    const progressB = stopFlipping(createPlayerRoundProgress(['plain'])); // never flips, just stops

    const inputs: RoundPlayerInput[] = [
      { playerId: 'a', tokens: createInitialTokens(25), progress: progressA },
      { playerId: 'b', tokens: createInitialTokens(25), progress: progressB },
    ];

    // pot=4 (2 players * 2 ante), bust order = ['a']
    const result = resolveRound(inputs, 4, ['a']);
    const a = result.players.find((p) => p.playerId === 'a')!;
    expect(a.antePayout).toBe(2); // ceil(4/2)
    expect(a.tokens.zone1).toBe(25 + 2); // no safe conversion (busted immediately), plus ante penalty
    expect(result.potRemaining).toBe(2);

    const b = result.players.find((p) => p.playerId === 'b')!;
    expect(b.antePayout).toBe(0);
  });
});
