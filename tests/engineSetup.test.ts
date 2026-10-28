import { describe, expect, it } from 'vitest';
import { createGameState, pendingLuckyPlacementOwners, setupRound, submitLuckyPlacement } from '../src/shared/game/engine.js';
import { anteTotalFor } from '../src/shared/rules/ante.js';
import { forcedPosition, luckyRecipientSeat } from '../src/shared/rules/luckyPlacement.js';
import { STARTING_ZONE1 } from '../src/shared/game/state.js';
import { seededRng } from './rng.js';

function makePlayerIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i}`);
}

describe('createGameState', () => {
  it('starts at roundNo=1, phase=round_setup, with the ante already collected into the pot', () => {
    const ids = makePlayerIds(3);
    const state = createGameState(ids, seededRng(1));

    expect(state.roundNo).toBe(1);
    expect(state.phase).toBe('round_setup');
    expect(state.pot).toBe(anteTotalFor(3));

    for (const id of ids) {
      const player = state.players[id];
      expect(player?.tokens.zone1).toBe(STARTING_ZONE1 - 2); // paid 2 ante
      expect(player?.tokens.zone2).toBe(0);
      expect(player?.mainSeven).toHaveLength(7);
      expect(player?.hand).toBeNull();
    }
  });

  it('assigns seats in the given player order', () => {
    const ids = makePlayerIds(4);
    const state = createGameState(ids, seededRng(2));
    ids.forEach((id, seat) => {
      expect(state.players[id]?.seat).toBe(seat);
    });
    expect(state.playerOrder).toEqual(ids);
  });

  it('throws for an invalid player count', () => {
    expect(() => createGameState(makePlayerIds(1), seededRng(3))).toThrow();
    expect(() => createGameState(makePlayerIds(6), seededRng(3))).toThrow();
  });
});

describe('pendingLuckyPlacementOwners', () => {
  it('initially lists every owner (nobody has placed yet)', () => {
    const ids = makePlayerIds(3);
    const state = createGameState(ids, seededRng(4));
    expect(new Set(pendingLuckyPlacementOwners(state))).toEqual(new Set(ids));
  });

  it('shrinks as placements are submitted, and is empty once round_active begins', () => {
    const ids = makePlayerIds(2);
    const state = createGameState(ids, seededRng(5));

    const owner0 = ids[0] as string;
    const owner1 = ids[1] as string;

    submitLuckyPlacement(state, owner0, 0, 0);
    expect(pendingLuckyPlacementOwners(state)).toEqual([owner1]);

    submitLuckyPlacement(state, owner1, 0, 0);
    expect(state.phase).toBe('round_active');
    expect(pendingLuckyPlacementOwners(state)).toEqual([]);
  });
});

describe('submitLuckyPlacement', () => {
  it('inserts the lucky card into the recipient (seat+1) hand at the chosen position', () => {
    const ids = makePlayerIds(3);
    const state = createGameState(ids, seededRng(6));

    const owner = state.players[ids[0] as string];
    const n = 3;
    const recipientSeat = luckyRecipientSeat(owner!.seat, n);
    const recipientId = state.playerOrder[recipientSeat] as string;
    const recipient = state.players[recipientId]!;
    const sevenBefore = recipient.mainSeven;

    const forced = forcedPosition(sevenBefore);
    const position = forced ?? 2;

    const result = submitLuckyPlacement(state, ids[0] as string, position, 0);
    expect(result.ok).toBe(true);
    expect(recipient.hand).toHaveLength(8);
    expect(recipient.luckyPlacementPosition).toBe(position);
    expect(recipient.hand?.[position]?.kind).toBe('lucky');
    expect(recipient.progress).not.toBeNull();
  });

  it('rejects placement from a non-participant', () => {
    const state = createGameState(makePlayerIds(2), seededRng(7));
    const result = submitLuckyPlacement(state, 'ghost', 0, 0);
    expect(result.ok).toBe(false);
  });

  it('rejects placing twice into the same recipient hand', () => {
    const ids = makePlayerIds(2);
    const state = createGameState(ids, seededRng(8));
    submitLuckyPlacement(state, ids[0] as string, 0, 0);
    // owner0's recipient is seat1 (ids[1]); nobody else can re-place into it.
    // simulate a duplicate submit attempt via the SAME owner again.
    const second = submitLuckyPlacement(state, ids[0] as string, 1, 0);
    expect(second.ok).toBe(false);
  });

  it('rejects an out-of-range position', () => {
    const ids = makePlayerIds(2);
    const state = createGameState(ids, seededRng(9));
    const result = submitLuckyPlacement(state, ids[0] as string, 99, 0);
    expect(result.ok).toBe(false);
  });

  it('rejects placement once the round has already advanced past round_setup', () => {
    const ids = makePlayerIds(2);
    const state = createGameState(ids, seededRng(10));
    submitLuckyPlacement(state, ids[0] as string, 0, 0);
    submitLuckyPlacement(state, ids[1] as string, 0, 0);
    expect(state.phase).toBe('round_active');

    const result = submitLuckyPlacement(state, ids[0] as string, 0, 0);
    expect(result.ok).toBe(false);
  });
});

describe('setupRound', () => {
  it('increments roundNo and re-deals fresh hands, carrying the pot forward', () => {
    const ids = makePlayerIds(2);
    const state = createGameState(ids, seededRng(11));
    submitLuckyPlacement(state, ids[0] as string, 0, 0);
    submitLuckyPlacement(state, ids[1] as string, 0, 0);

    const potAfterRound1Setup = state.pot;
    setupRound(state, seededRng(12));

    expect(state.roundNo).toBe(2);
    expect(state.phase).toBe('round_setup');
    expect(state.pot).toBe(potAfterRound1Setup + anteTotalFor(2)); // carried over + new ante
    for (const id of ids) {
      expect(state.players[id]?.hand).toBeNull();
      expect(state.players[id]?.mainSeven).toHaveLength(7);
    }
  });
});
