/**
 * ラッキーカード挿入(round_setupサブフェーズ)の対話UI。Phase 2の範囲。
 *
 * 自分が担当するのは「自分の次の座席(seat+1)%n」の手札へ、自分が引いたラッキーカードを
 * 挿入する位置を選ぶこと。対象の手札の内容は`game:handsView`で既に見えている(自分の
 * 手札ではないため)。
 */

import type { HandsView } from '../../shared/game/handsView.js';
import type { Card, PlayerCount } from '../../shared/types.js';
import { forcedPosition, luckyRecipientSeat } from '../../shared/rules/luckyPlacement.js';
import { cardArtSvg } from './cardArt.js';

export interface LuckyPlacementCallbacks {
  readonly onSubmit: (position: number) => void;
}

/** 自分の座席番号を、handsViewの中から見つける(handsViewは全員分のseatを含む)。 */
function findSeat(view: HandsView, playerId: string): number | null {
  const entry = view.hands.find((h) => h.playerId === playerId);
  return entry?.seat ?? null;
}

export function renderLuckyPlacement(
  container: HTMLElement,
  view: HandsView,
  selfPlayerId: string,
  playerCount: number,
  names: ReadonlyMap<string, string>,
  callbacks: LuckyPlacementCallbacks,
): void {
  container.innerHTML = '';
  container.className = 'panel lucky-placement';

  const mySeat = findSeat(view, selfPlayerId);
  if (mySeat === null) {
    return;
  }

  const recipientSeat = luckyRecipientSeat(mySeat, playerCount as PlayerCount);
  const recipientHand = view.hands.find((h) => h.seat === recipientSeat);
  if (recipientHand === undefined) {
    return;
  }

  // 対象の手札は自分のものではないので、round_setup中は常に revealed:true のはず。
  const cards: Card[] = recipientHand.cards.map((c) => (c.revealed ? { kind: c.kind, number: c.number } : { kind: 'bomb', number: null }));
  const recipientName = names.get(recipientHand.playerId) ?? '(不明なプレイヤー)';

  const title = document.createElement('div');
  title.textContent = `あなたのチャンスカードを、${recipientName}さんの手札に挿入してください`;
  container.appendChild(title);

  const row = document.createElement('div');
  row.className = 'lucky-placement-row';

  const forced = forcedPosition(cards);

  const makeSlotButton = (position: number): HTMLButtonElement => {
    const slot = document.createElement('button');
    slot.className = 'lucky-slot';
    slot.textContent = '▸';
    slot.disabled = forced !== null && forced !== position;
    slot.addEventListener('click', () => callbacks.onSubmit(position));
    return slot;
  };

  row.appendChild(makeSlotButton(0));
  cards.forEach((card, idx) => {
    const cardEl = document.createElement('div');
    cardEl.className = `hand-card hand-card--${card.kind} hand-card--mini`;
    cardEl.innerHTML = cardArtSvg(card.kind, card.number);
    row.appendChild(cardEl);
    row.appendChild(makeSlotButton(idx + 1));
  });

  container.appendChild(row);

  if (forced !== null) {
    const note = document.createElement('div');
    note.className = 'lucky-placement-note';
    note.textContent = '手札が全て爆弾のため、先頭への配置のみ選べます';
    container.appendChild(note);
  }
}

export function renderWaitingForOthersLuckyPlacement(container: HTMLElement, pendingOwnerIds: readonly string[]): void {
  container.innerHTML = '';
  container.className = 'panel';
  container.textContent = `他のプレイヤーがチャンスカードを配置中です… (残り${pendingOwnerIds.length}人)`;
}
