import { describe, expect, it } from 'vitest';
import { createGameState, flipCard, submitLuckyPlacement } from '../src/shared/game/engine.js';
import { forcedPosition } from '../src/shared/rules/luckyPlacement.js';
import { STARTING_ZONE1, TOTAL_ROUNDS, type GameState } from '../src/shared/game/state.js';
import { seededRng } from './rng.js';

function makePlayerIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i}`);
}

function totalTokens(state: GameState): number {
  const sum = state.playerOrder.reduce((acc, id) => {
    const tokens = state.players[id]!.tokens;
    return acc + tokens.zone1 + tokens.zone2;
  }, 0);
  return sum + state.pot;
}

function placeAllLuckyCards(state: GameState, ids: readonly string[], now: number): void {
  for (const id of ids) {
    const owner = state.players[id]!;
    const n = ids.length;
    const recipientSeat = (owner.seat + 1) % n;
    const recipientId = state.playerOrder[recipientSeat] as string;
    const recipient = state.players[recipientId]!;
    const forced = forcedPosition(recipient.mainSeven);
    const result = submitLuckyPlacement(state, id, forced ?? 0, now);
    expect(result.ok).toBe(true);
  }
}

describe('full 4-round game simulation', () => {
  it('conserves total tokens (zone1+zone2+pot === STARTING_ZONE1*n) at every step, for every player count', () => {
    for (const n of [2, 3, 4, 5] as const) {
      const ids = makePlayerIds(n);
      const rng = seededRng(42 + n);
      const state = createGameState(ids, rng);

      expect(totalTokens(state)).toBe(STARTING_ZONE1 * n);

      let now = 0;
      placeAllLuckyCards(state, ids, now);
      expect(totalTokens(state)).toBe(STARTING_ZONE1 * n);
      expect(state.phase).toBe('round_active');

      let roundsPlayed = 1;
      // greedy strategy: every player flips until they bust or run out of cards.
      while (state.phase !== 'game_end') {
        let anyFlipped = false;
        for (const id of ids) {
          const player = state.players[id]!;
          while (player.progress !== null && !player.progress.busted && !player.progress.stopped && player.progress.flippedCount < player.hand!.length) {
            now += 1;
            const result = flipCard(state, id, rng, now);
            expect(result.ok).toBe(true);
            anyFlipped = true;
            expect(totalTokens(state)).toBe(STARTING_ZONE1 * n);
            if (state.phase !== 'round_active') {
              break;
            }
          }
          if (state.phase !== 'round_active') {
            break;
          }
        }

        if (state.phase === 'round_setup') {
          roundsPlayed += 1;
          now += 1;
          placeAllLuckyCards(state, ids, now);
          expect(totalTokens(state)).toBe(STARTING_ZONE1 * n);
        } else if (!anyFlipped && state.phase === 'round_active') {
          throw new Error('simulation stalled: nobody could flip but round is still active');
        }
      }

      expect(state.roundNo).toBe(TOTAL_ROUNDS);
      expect(roundsPlayed).toBe(TOTAL_ROUNDS);
      expect(state.winnerIds).not.toBeNull();
      expect(state.winnerIds!.length).toBeGreaterThan(0);
      expect(totalTokens(state)).toBe(STARTING_ZONE1 * n);

      // winner(s) must have the minimum zone1 among all players
      const minZone1 = Math.min(...ids.map((id) => state.players[id]!.tokens.zone1));
      for (const winnerId of state.winnerIds!) {
        expect(state.players[winnerId]!.tokens.zone1).toBe(minZone1);
      }
    }
  });
});
