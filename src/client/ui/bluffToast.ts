/**
 * ブラフメッセージを、円卓上の送信者の真上にふわっと浮かぶトーストとして表示する。
 *
 * `renderGameView`の通常の再描画サイクル(innerHTML総入れ替え)とは無関係に、
 * `document.body`直下の専用レイヤーへ個別に追加・削除する。こうしないと、
 * 1秒ごとのタイマー再描画や他の状態更新でトーストの途中経過が壊れてしまう。
 */

const TOAST_LIFETIME_MS = 3400;

let layerEl: HTMLElement | null = null;

function ensureLayer(): HTMLElement {
  if (layerEl !== null) {
    return layerEl;
  }
  const el = document.createElement('div');
  el.id = 'bluff-toast-layer';
  document.body.appendChild(el);
  layerEl = el;
  return el;
}

/** `playerId`の座席(円卓上のDOM、`data-player-id`属性)の真上にトーストを出す。座席が見つからなければ何もしない。 */
export function showBluffToast(playerId: string, text: string): void {
  const seatEl = document.querySelector<HTMLElement>(`[data-player-id="${CSS.escape(playerId)}"]`);
  if (seatEl === null) {
    return;
  }

  const rect = seatEl.getBoundingClientRect();
  const toast = document.createElement('div');
  toast.className = 'bluff-toast';
  toast.textContent = text;
  toast.style.left = `${rect.left + rect.width / 2}px`;
  toast.style.top = `${rect.top}px`;

  ensureLayer().appendChild(toast);
  setTimeout(() => toast.remove(), TOAST_LIFETIME_MS);
}
