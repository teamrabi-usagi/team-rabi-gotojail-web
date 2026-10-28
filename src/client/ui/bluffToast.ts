/**
 * ブラフメッセージを、円卓上の送信者のミープルの右隣に吹き出しとして表示する
 * (`table-seat-meeple-wrap`内の`luckyBonusPending`吹き出しと同じ見た目・同じ位置)。
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

/** `playerId`のミープル(`data-meeple-for`属性)の右隣に吹き出しを出す。見つからなければ何もしない。 */
export function showBluffToast(playerId: string, text: string): void {
  const anchor = document.querySelector<HTMLElement>(`[data-meeple-for="${CSS.escape(playerId)}"]`);
  if (anchor === null) {
    return;
  }

  const rect = anchor.getBoundingClientRect();
  const toast = document.createElement('div');
  toast.className = 'meeple-bubble meeple-bubble--toast';
  toast.textContent = text;
  toast.style.left = `${rect.right}px`;
  toast.style.top = `${rect.top + rect.height / 2}px`;

  ensureLayer().appendChild(toast);
  setTimeout(() => toast.remove(), TOAST_LIFETIME_MS);
}
