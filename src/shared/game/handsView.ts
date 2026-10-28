/**
 * 視点ごとにマスクした「手札ビュー」を作る唯一の場所。
 * 典拠: docs/RULE_SPEC.md §視覚性(核心メカニクス)、docs/WEB_ARCHITECTURE.md §6。
 *
 * 自分の手札は、自分がまだめくっていないカードだけ`revealed:false`になる。
 * 他プレイヤーの手札、および自分が既にめくったカードはそのまま見える。
 * round_setup中(まだラッキー挿入が済んでいない)はmainSeven(7枚)だけをこの規則で見せる。
 */

import type { CardKind } from '../types.js';
import type { GameState, PlayerGameState } from './state.js';

export type HandCardView =
  | { readonly revealed: true; readonly kind: CardKind; readonly number: number | null; readonly flipped: boolean }
  | { readonly revealed: false };

export interface PlayerHandView {
  readonly playerId: string;
  readonly seat: number;
  readonly cardCount: number;
  readonly cards: readonly HandCardView[];
  readonly flippedCount: number;
  readonly busted: boolean;
  readonly bustedAtFlipIndex: number | null;
  readonly stopped: boolean;
  /** ラッキー挿入が済み、8枚の最終手札が確定しているか(round_setup中はfalse)。 */
  readonly handReady: boolean;
  /** 直前にラッキーカードをめくり、次の安全カードが2個分になるボーナスが未消費のまま残っているか。 */
  readonly luckyBonusPending: boolean;
}

export interface HandsView {
  readonly viewerPlayerId: string;
  readonly hands: readonly PlayerHandView[];
}

function maskCard(kind: CardKind, number: number | null, flipped: boolean, isOwnHand: boolean): HandCardView {
  if (!isOwnHand || flipped) {
    return { revealed: true, kind, number, flipped };
  }
  return { revealed: false };
}

function toHandViewForPlayer(player: PlayerGameState, viewerPlayerId: string): PlayerHandView {
  const isOwnHand = player.playerId === viewerPlayerId;

  if (player.hand === null) {
    return {
      playerId: player.playerId,
      seat: player.seat,
      cardCount: player.mainSeven.length,
      cards: player.mainSeven.map((card) => maskCard(card.kind, card.number, false, isOwnHand)),
      flippedCount: 0,
      busted: false,
      bustedAtFlipIndex: null,
      stopped: false,
      handReady: false,
      luckyBonusPending: false,
    };
  }

  const progress = player.progress;
  const flippedCount = progress?.flippedCount ?? 0;

  return {
    playerId: player.playerId,
    seat: player.seat,
    cardCount: player.hand.length,
    cards: player.hand.map((card, idx) => maskCard(card.kind, card.number, idx < flippedCount, isOwnHand)),
    flippedCount,
    busted: progress?.busted ?? false,
    bustedAtFlipIndex: progress?.bustedAtFlipIndex ?? null,
    stopped: progress?.stopped ?? false,
    handReady: true,
    luckyBonusPending: progress?.luckyBonusPending ?? false,
  };
}

export function toHandsView(state: GameState, viewerPlayerId: string): HandsView {
  return {
    viewerPlayerId,
    hands: state.playerOrder.map((playerId) => toHandViewForPlayer(state.players[playerId] as PlayerGameState, viewerPlayerId)),
  };
}
