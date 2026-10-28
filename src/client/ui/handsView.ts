/**
 * 手札ビュー(`game:handsView`)の描画。
 *
 * 円卓レイアウト: 自分を常に下(6時の位置)に固定し、他プレイヤーを座席順に
 * 円周上へ配置する。カードはプレースホルダー画像(cardArt.ts)で表示し、
 * 新たにめくられたカードにだけ「捨てた」アニメーションを1回だけ適用する
 * (直前との`flippedCount`差分で判定。タイマー等の無関係な再描画では再生しない)。
 */

import type { HandsView, PlayerHandView } from '../../shared/game/handsView.js';
import { cardArtSvg } from './cardArt.js';

/** playerId -> 直前に描画したflippedCount。新規めくりの検出にだけ使う。 */
const lastFlippedCounts = new Map<string, number>();

function nameFor(names: ReadonlyMap<string, string>, playerId: string): string {
  return names.get(playerId) ?? '(不明なプレイヤー)';
}

/** プレイヤーを表す簡易ミープル風アイコン(色はCSSの`color`で制御)。 */
const MEEPLE_SVG =
  '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">' +
  '<path d="M20 5c-4 0-6.5 3-6.5 6.5 0 2 .9 3.8 2 5-5 1.8-7.8 5.8-8.7 11-.6 3.3 1.7 6.5 5 6.5h16.4c3.3 0 5.6-3.2 5-6.5-.9-5.2-3.7-9.2-8.7-11 1.1-1.2 2-3 2-5C26.5 8 24 5 20 5z" fill="currentColor"/>' +
  '</svg>';

function renderCard(view: PlayerHandView['cards'][number], isMini: boolean, justRevealed: boolean): HTMLElement {
  const el = document.createElement('div');
  const sizeClass = isMini ? 'hand-card--mini' : '';
  if (view.revealed) {
    el.className = `hand-card hand-card--${view.kind} ${sizeClass}${view.flipped ? ' hand-card--flipped' : ''}${justRevealed ? ' hand-card--discard-anim' : ''}`.trim();
    el.innerHTML = cardArtSvg(view.kind);
  } else {
    el.className = `hand-card hand-card--hidden ${sizeClass}`.trim();
    el.innerHTML = cardArtSvg('hidden');
  }
  return el;
}

function renderSeat(hand: PlayerHandView, isSelf: boolean, names: ReadonlyMap<string, string>): HTMLElement {
  const seatEl = document.createElement('div');
  seatEl.className = `table-seat${isSelf ? ' you' : ''}`;
  seatEl.dataset.playerId = hand.playerId;

  const label = document.createElement('div');
  label.className = 'table-seat-label';
  const statusSuffix = hand.busted ? '(脱落)' : hand.stopped ? '(停止)' : '';
  label.textContent = `${isSelf ? 'あなた' : nameFor(names, hand.playerId)}${statusSuffix}`;
  seatEl.appendChild(label);

  const meeple = document.createElement('div');
  meeple.className = 'table-seat-meeple';
  meeple.innerHTML = MEEPLE_SVG;
  seatEl.appendChild(meeple);

  const cardsEl = document.createElement('div');
  cardsEl.className = 'table-seat-cards';

  if (!hand.handReady) {
    const placeholder = document.createElement('div');
    placeholder.className = 'hand-card hand-card--pending hand-card--mini';
    placeholder.textContent = `準備中(${hand.cardCount})`;
    cardsEl.appendChild(placeholder);
  } else {
    const prevFlipped = lastFlippedCounts.get(hand.playerId) ?? 0;
    const newlyRevealedFrom = hand.flippedCount > prevFlipped ? prevFlipped : null;
    lastFlippedCounts.set(hand.playerId, hand.flippedCount);

    hand.cards.forEach((card, idx) => {
      const justRevealed = newlyRevealedFrom !== null && idx >= newlyRevealedFrom && idx < hand.flippedCount;
      cardsEl.appendChild(renderCard(card, true, justRevealed));
    });
  }

  seatEl.appendChild(cardsEl);
  return seatEl;
}

export function renderHandsView(container: HTMLElement, view: HandsView, selfPlayerId: string, names: ReadonlyMap<string, string>): void {
  container.innerHTML = '';
  container.className = 'table-circle';

  const selfIndex = view.hands.findIndex((h) => h.playerId === selfPlayerId);
  const n = view.hands.length;

  view.hands.forEach((hand, i) => {
    const isSelf = hand.playerId === selfPlayerId;
    const seatEl = renderSeat(hand, isSelf, names);

    const offset = selfIndex === -1 ? i : i - selfIndex;
    const angle = Math.PI / 2 + (2 * Math.PI * offset) / n;
    const cx = 50 + 40 * Math.cos(angle);
    const cy = 50 + 40 * Math.sin(angle);
    seatEl.style.left = `${cx}%`;
    seatEl.style.top = `${cy}%`;

    container.appendChild(seatEl);
  });
}
