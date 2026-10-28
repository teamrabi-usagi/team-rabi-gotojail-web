/**
 * ゲーム終了演出。4ラウンド終了後、ワースト(残り刑期が多い順)からベストへ、
 * 1人ずつ判決を言い渡すようにCSSアニメーションで順番に明かし、最後に勝者を
 * 紙吹雪(にんじん)付きで祝う。`game_end`フェーズに入った瞬間に1度だけ構築される
 * (main.tsがgame:endedを受けてのみ再描画をトリガーするため、演出の途中で
 * 無関係な再描画によって壊れることはない)。
 */

import type { PublicGameState } from '../../shared/game/publicState.js';

function nameFor(names: ReadonlyMap<string, string>, playerId: string): string {
  return names.get(playerId) ?? '(不明なプレイヤー)';
}

interface StandingRow {
  readonly playerId: string;
  readonly zone1: number;
  readonly rank: number;
}

function computeStandings(players: PublicGameState['players']): StandingRow[] {
  const sorted = [...players].sort((a, b) => a.zone1 - b.zone1);
  const rows: StandingRow[] = [];
  let rank = 0;
  let lastZone1: number | null = null;
  sorted.forEach((p, idx) => {
    if (lastZone1 === null || p.zone1 !== lastZone1) {
      rank = idx + 1;
      lastZone1 = p.zone1;
    }
    rows.push({ playerId: p.playerId, zone1: p.zone1, rank });
  });
  return rows;
}

const STAGGER_SECONDS = 0.5;
const INTRO_SECONDS = 0.8;
const CONFETTI_COUNT = 28;
const CONFETTI_EMOJI = ['🥕', '🐰', '✨'];

function createConfettiLayer(delaySeconds: number): HTMLElement {
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.textContent = CONFETTI_EMOJI[Math.floor(Math.random() * CONFETTI_EMOJI.length)] ?? '🥕';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.animationDelay = `${delaySeconds + Math.random() * 0.6}s`;
    piece.style.animationDuration = `${1.8 + Math.random() * 1.4}s`;
    layer.appendChild(piece);
  }
  return layer;
}

export function renderGameEnd(
  container: HTMLElement,
  gameState: PublicGameState,
  selfPlayerId: string,
  names: ReadonlyMap<string, string>,
  winnerIds: readonly string[],
): void {
  const root = document.createElement('div');
  root.className = 'game-end panel';

  const intro = document.createElement('div');
  intro.className = 'game-end-intro';
  intro.textContent = '判決の時…';
  root.appendChild(intro);

  const standings = computeStandings(gameState.players);
  const worstFirst = [...standings].reverse();

  const list = document.createElement('div');
  list.className = 'standings';
  worstFirst.forEach((row, i) => {
    const isSelf = row.playerId === selfPlayerId;
    const isWinner = row.rank === 1;

    const rowEl = document.createElement('div');
    rowEl.className = `standing-row${isWinner ? ' standing-row--winner' : ''}${isSelf ? ' standing-row--you' : ''}`;
    rowEl.style.animationDelay = `${INTRO_SECONDS + i * STAGGER_SECONDS}s`;

    const rankEl = document.createElement('span');
    rankEl.className = 'standing-rank';
    rankEl.textContent = isWinner ? '🏆 無罪放免' : `${row.rank}位`;
    rowEl.appendChild(rankEl);

    const nameEl = document.createElement('span');
    nameEl.className = 'standing-name';
    nameEl.textContent = isSelf ? 'あなた' : nameFor(names, row.playerId);
    rowEl.appendChild(nameEl);

    const zoneEl = document.createElement('span');
    zoneEl.className = 'standing-zone1';
    zoneEl.textContent = `残り刑期①${row.zone1}`;
    rowEl.appendChild(zoneEl);

    list.appendChild(rowEl);
  });
  root.appendChild(list);

  const finalDelay = INTRO_SECONDS + standings.length * STAGGER_SECONDS + 0.2;

  const finalMessage = document.createElement('div');
  finalMessage.className = 'game-end-final-message';
  finalMessage.style.animationDelay = `${finalDelay}s`;
  const isSelfWinner = winnerIds.includes(selfPlayerId);
  if (isSelfWinner) {
    finalMessage.textContent = '🎉 無罪放免!あなたの勝利です!';
  } else {
    const winnerNames = winnerIds.map((id) => nameFor(names, id)).join(', ');
    finalMessage.textContent = `残念、まだ娑婆には出られないようです…(勝者: ${winnerNames})`;
  }
  root.appendChild(finalMessage);

  root.appendChild(createConfettiLayer(finalDelay));

  container.appendChild(root);
}
