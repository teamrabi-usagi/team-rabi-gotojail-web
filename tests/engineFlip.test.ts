import { describe, expect, it } from 'vitest';
import { createGameState, flipCard, respondToGuardEvent, stop, submitLuckyPlacement } from '../src/shared/game/engine.js';
import { forcedPosition } from '../src/shared/rules/luckyPlacement.js';
import { remainingSafeCount } from '../src/shared/rules/flip.js';
import { seededRng } from './rng.js';

function makePlayerIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i}`);
}

/**
 * ラッキーカードは(強制位置でない限り)末尾(position 7)に挿入する。こうすることで
 * hand[0]は常にmainSeven[0](自然な先頭の安全側カード)を反映し、テストで検証しやすくなる。
 */
function startActiveGame(n: number, seed: number) {
  const ids = makePlayerIds(n);
  const state = createGameState(ids, seededRng(seed));
  for (const id of ids) {
    const owner = state.players[id]!;
    const n2 = ids.length;
    const recipientSeat = (owner.seat + 1) % n2;
    const recipientId = state.playerOrder[recipientSeat] as string;
    const recipient = state.players[recipientId]!;
    const forced = forcedPosition(recipient.mainSeven);
    submitLuckyPlacement(state, id, forced ?? 7, 0);
  }
  expect(state.phase).toBe('round_active');
  return { ids, state };
}

/** 脱落するまで(または手札を使い切るまで)めくり続ける。 */
function flipUntilBustOrExhausted(state: ReturnType<typeof createGameState>, playerId: string, rng: ReturnType<typeof seededRng>) {
  for (let i = 0; i < 10; i++) {
    const result = flipCard(state, playerId, rng, i);
    if (!result.ok || result.outcome === 'bomb') {
      return result;
    }
  }
  throw new Error('flipUntilBustOrExhausted(): did not bust within 10 flips');
}

describe('flipCard', () => {
  it('rejects flipping outside round_active', () => {
    const ids = makePlayerIds(2);
    const state = createGameState(ids, seededRng(1));
    // still round_setup (nobody placed yet)
    const result = flipCard(state, ids[0] as string, seededRng(2), 0);
    expect(result.ok).toBe(false);
  });

  it('rejects flipping for a nonexistent player', () => {
    const { state } = startActiveGame(2, 3);
    const result = flipCard(state, 'ghost', seededRng(4), 0);
    expect(result.ok).toBe(false);
  });

  it('a safe flip returns outcome=safe and advances flippedCount', () => {
    const { ids, state } = startActiveGame(2, 5);
    const player = state.players[ids[0] as string]!;
    const kind = player.hand![0]!.kind;

    const result = flipCard(state, ids[0] as string, seededRng(6), 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    if (kind === 'bomb') {
      expect(result.outcome).toBe('bomb');
      expect(player.progress?.busted).toBe(true);
    } else {
      expect(result.outcome).toBe('safe');
      expect(player.progress?.flippedCount).toBe(1);
    }
  });

  it('rejects flipping after bust', () => {
    const { ids, state } = startActiveGame(2, 5);
    const player = state.players[ids[0] as string]!;

    const busted = flipUntilBustOrExhausted(state, ids[0] as string, seededRng(999));
    expect(busted.ok).toBe(true);
    if (busted.ok) {
      expect(busted.outcome).toBe('bomb');
    }
    expect(player.progress?.busted).toBe(true);

    const second = flipCard(state, ids[0] as string, seededRng(1000), 10);
    expect(second.ok).toBe(false);
  });
});

describe('stop', () => {
  it('marks the player as stopped and rejects further flips', () => {
    const { ids, state } = startActiveGame(3, 10);
    const result = stop(state, ids[0] as string, seededRng(11), 0);
    expect(result.ok).toBe(true);
    expect(state.players[ids[0] as string]?.progress?.stopped).toBe(true);

    const flipAfterStop = flipCard(state, ids[0] as string, seededRng(12), 0);
    expect(flipAfterStop.ok).toBe(false);
  });

  it('rejects stopping for a nonexistent player', () => {
    const { state } = startActiveGame(2, 13);
    const result = stop(state, 'ghost', seededRng(14), 0);
    expect(result.ok).toBe(false);
  });
});

describe('round auto-resolution (all players done)', () => {
  it('resolves the round once every player has busted or stopped, and advances roundNo', () => {
    const { ids, state } = startActiveGame(2, 20);

    // stop both players immediately -> round should auto-resolve
    const r1 = stop(state, ids[0] as string, seededRng(21), 1000);
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      expect(r1.roundSummary).toBeNull(); // not everyone done yet
    }

    const r2 = stop(state, ids[1] as string, seededRng(22), 2000);
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.roundSummary).not.toBeNull();
      expect(r2.roundSummary?.roundNo).toBe(1);
      expect(r2.roundSummary?.timedOut).toBe(false);
    }

    expect(state.roundNo).toBe(2);
    expect(state.phase).toBe('round_setup');
  });

  it('carries the remaining timer seconds forward when the round ends early (not by timeout)', () => {
    const { ids, state } = startActiveGame(2, 23);
    const roundStartedAt = state.roundEndsAt! - state.roundTimerSeconds * 1000;

    stop(state, ids[0] as string, seededRng(24), roundStartedAt + 1000);
    const result = stop(state, ids[1] as string, seededRng(25), roundStartedAt + 1000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // ended 1 second (1000ms) into a 300s round -> ~299s should carry over
      expect(result.roundSummary?.timerCarrySeconds).toBe(299);
    }
  });
});

describe('game end after TOTAL_ROUNDS', () => {
  it('sets phase=game_end and winnerIds after the 4th round resolves', () => {
    const { ids, state } = startActiveGame(2, 30);

    for (let round = 1; round <= 4; round++) {
      // stop both players immediately each round to move things along quickly
      stop(state, ids[0] as string, seededRng(100 + round), round * 10000);
      const result = stop(state, ids[1] as string, seededRng(200 + round), round * 10000);

      if (round < 4) {
        expect(state.phase).toBe('round_setup');
        // place lucky cards again for the next round
        for (const id of ids) {
          submitLuckyPlacement(state, id, 0, round * 10000 + 1);
        }
      } else {
        expect(result.ok).toBe(true);
        expect(state.phase).toBe('game_end');
        expect(state.winnerIds).not.toBeNull();
        expect(state.winnerIds?.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('instant win when zone1 reaches 0', () => {
  it('ends the game immediately once the round-winner bonus brings someone to zone1=0, before the 4-round cap', () => {
    const { ids, state } = startActiveGame(2, 50);

    // Round winner(s) = survivors with the fewest remaining safe cards. Since neither
    // player flips before stopping, this is whoever's dealt hand happens to have fewer
    // safe cards (not necessarily a tie) -- compute it rather than assuming, so the test
    // holds regardless of what this seed actually deals.
    const counts = ids.map((id) => remainingSafeCount(state.players[id as string]!.progress!));
    const minCount = Math.min(...counts);
    const roundWinnerIds = ids.filter((_, i) => counts[i] === minCount) as string[];

    // give every prospective round winner exactly enough zone1 to hit 0 from the
    // +2 bonus; everyone else gets a comfortable cushion well above 0.
    for (const id of ids) {
      const player = state.players[id as string]!;
      const isWinner = roundWinnerIds.includes(id as string);
      player.tokens = { zone1: isWinner ? 2 : 20, zone2: player.tokens.zone2 };
    }

    for (const id of ids) {
      const result = stop(state, id as string, seededRng(51), 0);
      expect(result.ok).toBe(true);
    }

    expect(state.phase).toBe('game_end');
    expect(state.roundNo).toBeLessThan(4);
    for (const id of roundWinnerIds) {
      expect(state.players[id]!.tokens.zone1).toBe(0);
    }
    expect(new Set(state.winnerIds)).toEqual(new Set(roundWinnerIds));
  });
});

describe('guard-marked card events', () => {
  it('flipping a guard-marked card pauses the round (pendingGuardEvent set, roundEndsAt cleared) and blocks everyone from flipping/stopping', () => {
    // search for a seed (3 players, so guard cards exist) whose first-flipped card for p0 is a guard card.
    for (let seed = 0; seed < 300; seed++) {
      const { ids, state } = startActiveGame(3, seed);
      const player = state.players[ids[0] as string]!;
      if (player.hand![0]!.kind !== 'guard') {
        continue;
      }

      const result = flipCard(state, ids[0] as string, seededRng(seed + 5000), 1000);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.outcome).toBe('safe');
      expect(result.guardEvent).not.toBeNull();
      expect(state.pendingGuardEvent).not.toBeNull();
      expect(state.roundEndsAt).toBeNull();

      const targetId = result.guardEvent!.targetPlayerId;
      const nonTargetId = ids.find((id) => id !== targetId)!;

      // everyone (including the target) is blocked from flipping/stopping while pending.
      expect(flipCard(state, targetId, seededRng(1), 1001).ok).toBe(false);
      expect(stop(state, nonTargetId, seededRng(2), 1001).ok).toBe(false);

      // only the target may respond; anyone else is rejected.
      expect(respondToGuardEvent(state, nonTargetId, 2, seededRng(3), 1002).ok).toBe(false);

      const responded = respondToGuardEvent(state, targetId, 2, seededRng(4), 1002);
      expect(responded.ok).toBe(true);
      if (responded.ok) {
        expect(responded.resolved.count).toBe(2);
      }
      expect(state.pendingGuardEvent).toBeNull();
      expect(state.roundEndsAt).not.toBeNull();
      return;
    }
    throw new Error('no seed produced a guard-first hand within 300 attempts; widen the search range');
  });

  it('never triggers for 2 players (no guard cards exist in the 2-player composition)', () => {
    for (let seed = 0; seed < 50; seed++) {
      const { state, ids } = startActiveGame(2, seed + 9000);
      for (const id of ids) {
        for (const c of state.players[id]!.hand!) {
          expect(c.kind).not.toBe('guard');
        }
      }
    }
  });
});
