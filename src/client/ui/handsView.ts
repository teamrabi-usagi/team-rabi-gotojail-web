/**
 * 手札ビュー(`game:handsView`)の描画。Phase 2の範囲。
 */

import type { HandsView } from '../../shared/game/handsView.js';

const KIND_LABEL: Record<string, string> = {
  plain: 'ブランク',
  guard: '看守',
  lucky: 'ラッキー',
  bomb: '爆弾',
};

export function renderHandsView(container: HTMLElement, view: HandsView, selfPlayerId: string): void {
  container.innerHTML = '';
  container.className = 'hands-view';

  for (const hand of view.hands) {
    const isSelf = hand.playerId === selfPlayerId;

    const row = document.createElement('div');
    row.className = 'hand-row';

    const label = document.createElement('div');
    label.className = 'hand-row-label';
    label.textContent = `${isSelf ? 'あなた' : hand.playerId}${hand.busted ? '(脱落)' : hand.stopped ? '(停止)' : ''}`;
    row.appendChild(label);

    const cardsEl = document.createElement('div');
    cardsEl.className = 'hand-cards';

    if (!hand.handReady) {
      const placeholder = document.createElement('div');
      placeholder.className = 'hand-card hand-card--pending';
      placeholder.textContent = `準備中(${hand.cardCount}枚)`;
      cardsEl.appendChild(placeholder);
    } else {
      for (const card of hand.cards) {
        const cardEl = document.createElement('div');
        if (card.revealed) {
          cardEl.className = `hand-card hand-card--${card.kind}${card.flipped ? ' hand-card--flipped' : ''}`;
          cardEl.textContent = KIND_LABEL[card.kind] ?? card.kind;
        } else {
          cardEl.className = 'hand-card hand-card--hidden';
          cardEl.textContent = '?';
        }
        cardsEl.appendChild(cardEl);
      }
    }

    row.appendChild(cardsEl);
    container.appendChild(row);
  }
}
