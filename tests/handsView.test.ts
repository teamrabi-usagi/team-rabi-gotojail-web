import { describe, expect, it } from 'vitest';
import { createGameState, submitLuckyPlacement } from '../src/shared/game/engine.js';
import { flipNext } from '../src/shared/rules/flip.js';
import { toHandsView } from '../src/shared/game/handsView.js';
import { seededRng } from './rng.js';

function makePlayerIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i}`);
}

describe('toHandsView during round_setup (before lucky placement)', () => {
  it('masks the viewer own mainSeven, but reveals everyone elses mainSeven', () => {
    const ids = makePlayerIds(3);
    const state = createGameState(ids, seededRng(20));

    const viewId = ids[0] as string;
    const view = toHandsView(state, viewId);

    for (const hand of view.hands) {
      expect(hand.handReady).toBe(false);
      expect(hand.cards).toHaveLength(7);
      if (hand.playerId === viewId) {
        for (const card of hand.cards) {
          expect(card.revealed).toBe(false);
        }
      } else {
        for (const card of hand.cards) {
          expect(card.revealed).toBe(true);
        }
      }
    }
  });
});

describe('toHandsView during round_active', () => {
  it('masks only the viewers own UNFLIPPED cards; everyone elses hand is fully visible', () => {
    const ids = makePlayerIds(2);
    const state = createGameState(ids, seededRng(21));
    submitLuckyPlacement(state, ids[0] as string, 0, 0);
    submitLuckyPlacement(state, ids[1] as string, 0, 0);
    expect(state.phase).toBe('round_active');

    const viewer = ids[0] as string;
    const other = ids[1] as string;

    const view = toHandsView(state, viewer);
    const ownHandView = view.hands.find((h) => h.playerId === viewer)!;
    const otherHandView = view.hands.find((h) => h.playerId === other)!;

    expect(ownHandView.handReady).toBe(true);
    expect(ownHandView.cards).toHaveLength(8);
    for (const card of ownHandView.cards) {
      expect(card.revealed).toBe(false);
    }

    for (const card of otherHandView.cards) {
      expect(card.revealed).toBe(true);
    }
  });

  it('reveals a card to its own owner the instant it is flipped, and keeps it revealed (even a bust-causing bomb)', () => {
    const ids = makePlayerIds(2);
    const state = createGameState(ids, seededRng(22));
    submitLuckyPlacement(state, ids[0] as string, 0, 0);
    submitLuckyPlacement(state, ids[1] as string, 0, 0);

    const viewer = ids[0] as string;
    const player = state.players[viewer]!;

    // flip the first card for real using the shared flip.ts logic
    const result = flipNext(player.progress!);
    player.progress = result.progress;

    const view = toHandsView(state, viewer);
    const ownHandView = view.hands.find((h) => h.playerId === viewer)!;

    const firstCard = ownHandView.cards[0]!;
    expect(firstCard.revealed).toBe(true);
    if (firstCard.revealed) {
      expect(firstCard.kind).toBe(result.flippedKind);
      expect(firstCard.flipped).toBe(true);
    }

    // the rest remain hidden to the owner
    for (let i = 1; i < ownHandView.cards.length; i++) {
      expect(ownHandView.cards[i]!.revealed).toBe(false);
    }

    // but other viewers see ALL of this player's cards regardless of flipped state
    const otherView = toHandsView(state, ids[1] as string);
    const sameHandFromOtherView = otherView.hands.find((h) => h.playerId === viewer)!;
    for (const card of sameHandFromOtherView.cards) {
      expect(card.revealed).toBe(true);
    }
  });

  it('never reveals the hidden/removed cards to anyone (handsView only ever contains dealt hands)', () => {
    const ids = makePlayerIds(5);
    const state = createGameState(ids, seededRng(23));
    const view = toHandsView(state, ids[0] as string);
    const totalCardsAcrossAllHands = view.hands.reduce((sum, h) => sum + h.cards.length, 0);
    // 5 players * 7 mainSeven cards each = 35 (lucky not yet inserted, hidden 6 never appear here)
    expect(totalCardsAcrossAllHands).toBe(5 * 7);
  });
});
