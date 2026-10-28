import { describe, expect, it } from 'vitest';
import { createGameState, flipCard, respondToGuardEvent, submitLuckyPlacement } from '../src/shared/game/engine.js';
import { forcedPosition } from '../src/shared/rules/luckyPlacement.js';
import { anteTotalFor } from '../src/shared/rules/ante.js';
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

/**
 * 座(アンティ)はプレイヤーの①から引かず、ラウンドごとに人数×2だけ座を直接増やすため
 * (トークンは保存則を離れ、毎ラウンド系全体の総量が増える)、「保存されるべき総量」は
 * 固定値ではなく、ここまでに何ラウンド分のアンティが積まれたかに応じて動く。
 */
function expectedTotalTokens(state: GameState, n: number): number {
  return STARTING_ZONE1 * n + state.roundNo * anteTotalFor(n as 2 | 3 | 4 | 5);
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
  it('keeps total tokens (zone1+zone2+pot) exactly at STARTING_ZONE1*n plus the ante accumulated so far, at every step, for every player count', () => {
    for (const n of [2, 3, 4, 5] as const) {
      const ids = makePlayerIds(n);
      const rng = seededRng(42 + n);
      const state = createGameState(ids, rng);

      expect(totalTokens(state)).toBe(expectedTotalTokens(state, n));

      let now = 0;
      placeAllLuckyCards(state, ids, now);
      expect(totalTokens(state)).toBe(expectedTotalTokens(state, n));
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
            expect(totalTokens(state)).toBe(expectedTotalTokens(state, n));

            // 看守マーク付きカードをめくると進行が一時停止するので、即座に(適当な回答で)解消する。
            if (state.pendingGuardEvent !== null) {
              now += 1;
              const respondResult = respondToGuardEvent(state, state.pendingGuardEvent.targetPlayerId, 3, rng, now);
              expect(respondResult.ok).toBe(true);
              expect(totalTokens(state)).toBe(expectedTotalTokens(state, n));
            }

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
          expect(totalTokens(state)).toBe(expectedTotalTokens(state, n));
        } else if (!anyFlipped && state.phase === 'round_active') {
          throw new Error('simulation stalled: nobody could flip but round is still active');
        }
      }

      // the game can now end before round 4 if someone reaches zone1===0 (instant win);
      // the 4-round cap is only a fallback for when nobody reaches 0.
      expect(state.roundNo).toBeLessThanOrEqual(TOTAL_ROUNDS);
      expect(roundsPlayed).toBe(state.roundNo);
      expect(state.winnerIds).not.toBeNull();
      expect(state.winnerIds!.length).toBeGreaterThan(0);
      expect(totalTokens(state)).toBe(expectedTotalTokens(state, n));

      // winner(s) must have the minimum zone1 among all players
      const minZone1 = Math.min(...ids.map((id) => state.players[id]!.tokens.zone1));
      for (const winnerId of state.winnerIds!) {
        expect(state.players[winnerId]!.tokens.zone1).toBe(minZone1);
      }

      // ending before the 4-round cap must mean the instant-win-at-zero rule fired.
      if (state.roundNo < TOTAL_ROUNDS) {
        expect(minZone1).toBe(0);
      }
    }
  });
});
