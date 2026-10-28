/**
 * ラウンド終了時の「ジャッジ」演出。`game:round:resolved`を受けて1回だけ
 * フルスクリーンのオーバーレイを表示する。`document.body`へ直接追加し、
 * 通常の再描画サイクル(`renderGameView`のinnerHTML総入れ替え)とは無関係に
 * 自分でタイマー管理して消える(bluffToast.tsと同じ理由)。
 *
 * 各プレイヤーの、このラウンドでまだめくっていなかった残りのカードを
 * ここで初めて全員に一斉公開する(`finalHand`/`flippedCountAtEnd`、
 * 本人の自分の手札も含む — ラウンドが終わった後の見せ場なので例外的に解禁する)。
 */

import type { PublicGameState } from '../../shared/game/publicState.js';
import type { RoundResolvedSummary } from '../../shared/game/state.js';
import { cardArtSvg } from './cardArt.js';

const REVEAL_START_DELAY = 0.7;
const CARD_STAGGER = 0.08;
const OVERLAY_LIFETIME_MS = 4600;

function nameFor(names: ReadonlyMap<string, string>, playerId: string): string {
  return names.get(playerId) ?? '(不明なプレイヤー)';
}

export function showRoundJudge(
  summary: RoundResolvedSummary,
  players: PublicGameState['players'],
  selfPlayerId: string,
  names: ReadonlyMap<string, string>,
): void {
  const overlay = document.createElement('div');
  overlay.className = 'judge-overlay';

  const backdrop = document.createElement('div');
  backdrop.className = 'judge-backdrop';
  overlay.appendChild(backdrop);

  const modal = document.createElement('div');
  modal.className = 'judge-modal';

  const title = document.createElement('div');
  title.className = 'judge-title';
  title.textContent = 'ジャッジ!';
  modal.appendChild(title);

  const handsEl = document.createElement('div');
  handsEl.className = 'judge-hands';

  for (const p of summary.players) {
    const playerMeta = players.find((pp) => pp.playerId === p.playerId);
    const prisonerNumber = (playerMeta?.seat ?? 0) + 1;
    const isSelf = p.playerId === selfPlayerId;

    const row = document.createElement('div');
    row.className = 'judge-player-hand';

    const nameEl = document.createElement('div');
    nameEl.className = 'judge-player-name';
    const label = isSelf ? 'あなた' : nameFor(names, p.playerId);
    nameEl.textContent = `囚人${prisonerNumber}番 ${label}${p.busted ? '(脱落)' : ''}`;
    row.appendChild(nameEl);

    const cardsEl = document.createElement('div');
    cardsEl.className = 'judge-cards';
    p.finalHand.forEach((kind, idx) => {
      const cardEl = document.createElement('div');
      const alreadyFlipped = idx < p.flippedCountAtEnd;
      cardEl.className = `hand-card hand-card--${kind} hand-card--mini${alreadyFlipped ? '' : ' judge-card-reveal'}`;
      cardEl.innerHTML = cardArtSvg(kind);
      if (!alreadyFlipped) {
        const delay = REVEAL_START_DELAY + (idx - p.flippedCountAtEnd) * CARD_STAGGER;
        cardEl.style.animationDelay = `${delay}s`;
      }
      cardsEl.appendChild(cardEl);
    });
    row.appendChild(cardsEl);

    handsEl.appendChild(row);
  }
  modal.appendChild(handsEl);

  const announcement = document.createElement('div');
  announcement.className = 'judge-announcement';
  if (summary.roundWinnerIds.length === 0) {
    announcement.textContent = '今ラウンドは生存者なし…全員が脱落しました';
  } else {
    announcement.innerHTML = summary.roundWinnerIds
      .map((id) => {
        const playerMeta = players.find((pp) => pp.playerId === id);
        const prisonerNumber = (playerMeta?.seat ?? 0) + 1;
        const summaryRow = summary.players.find((p) => p.playerId === id);
        const reduction = (summaryRow?.safeFlipConversion ?? 0) + (summaryRow?.roundWinnerBonusApplied === true ? 2 : 0);
        return `<div>囚人番号${prisonerNumber}番!勝利!刑期${reduction}年を減刑!</div>`;
      })
      .join('');
  }
  announcement.style.animationDelay = `${REVEAL_START_DELAY + 8 * CARD_STAGGER + 0.3}s`;
  modal.appendChild(announcement);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  setTimeout(() => overlay.remove(), OVERLAY_LIFETIME_MS);
}
