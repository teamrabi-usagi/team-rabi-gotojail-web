/**
 * ゲーム画面の描画(round/pot/刑期トークンのヘッダー + round_setup/round_activeの内容)。
 */

import type { PublicGameState } from '../../shared/game/publicState.js';
import type { HandsView } from '../../shared/game/handsView.js';
import type { RoundResolvedSummary } from '../../shared/game/state.js';
import { renderHandsView } from './handsView.js';
import { renderLuckyPlacement, renderWaitingForOthersLuckyPlacement, type LuckyPlacementCallbacks } from './luckyPlacement.js';
import { renderChat, type ChatCallbacks, type ChatTarget } from './chat.js';

export interface GameViewCallbacks extends LuckyPlacementCallbacks, ChatCallbacks {
  readonly onFlip: () => void;
  readonly onStop: () => void;
}

export interface GameViewLog {
  readonly roundSummaries: readonly RoundResolvedSummary[];
  readonly winnerIds: readonly string[] | null;
}

const PHASE_LABELS: Record<PublicGameState['phase'], string> = {
  round_setup: '① ラッキーカード挿入フェーズ',
  round_active: '② めくりフェーズ',
  round_end: '③ ラウンド精算フェーズ',
  game_end: '④ 結果発表',
};

function nameFor(names: ReadonlyMap<string, string>, playerId: string): string {
  return names.get(playerId) ?? '(不明なプレイヤー)';
}

export function renderGameView(
  container: HTMLElement,
  gameState: PublicGameState,
  handsView: HandsView,
  selfPlayerId: string,
  names: ReadonlyMap<string, string>,
  log: GameViewLog,
  callbacks: GameViewCallbacks,
): void {
  container.innerHTML = '';

  const title = document.createElement('h1');
  title.textContent = '🔒 GOTOJAIL!(刑務所に行け!)';
  container.appendChild(title);

  const phaseBadge = document.createElement('div');
  phaseBadge.className = 'phase-badge';
  phaseBadge.textContent = PHASE_LABELS[gameState.phase];
  container.appendChild(phaseBadge);

  if (log.winnerIds !== null) {
    const banner = document.createElement('div');
    banner.className = 'panel game-end-banner';
    const isSelfWinner = log.winnerIds.includes(selfPlayerId);
    const winnerNames = log.winnerIds.map((id) => (id === selfPlayerId ? 'あなた' : nameFor(names, id))).join(', ');
    banner.textContent = isSelfWinner ? '🎉 無罪放免!あなたの勝利です!' : `ゲーム終了。勝者: ${winnerNames}`;
    container.appendChild(banner);
    const final = document.createElement('div');
    final.className = 'panel';
    for (const p of gameState.players) {
      const line = document.createElement('div');
      line.textContent = `${p.playerId === selfPlayerId ? 'あなた' : nameFor(names, p.playerId)}: 残り刑期①${p.zone1}`;
      final.appendChild(line);
    }
    container.appendChild(final);
    return;
  }

  const header = document.createElement('div');
  header.className = 'panel game-header';

  const roundLabel = document.createElement('div');
  roundLabel.textContent = `ラウンド ${gameState.roundNo} / ${gameState.totalRounds}`;
  header.appendChild(roundLabel);

  const potLabel = document.createElement('div');
  potLabel.textContent = `座: ${gameState.pot}個`;
  header.appendChild(potLabel);

  if (gameState.roundEndsAt !== null) {
    const remainingSec = Math.max(0, Math.ceil((gameState.roundEndsAt - Date.now()) / 1000));
    const timerLabel = document.createElement('div');
    timerLabel.textContent = `残り時間: ${remainingSec}秒`;
    header.appendChild(timerLabel);
  }

  const tokensList = document.createElement('ul');
  tokensList.className = 'player-list';
  for (const p of gameState.players) {
    const li = document.createElement('li');
    const isSelf = p.playerId === selfPlayerId;
    const span = document.createElement('span');
    span.className = isSelf ? 'you' : '';
    const label = isSelf ? 'あなた' : nameFor(names, p.playerId);
    span.textContent = `${label}(囚人${p.seat + 1}番): 残り刑期①${p.zone1} / 自由②${p.zone2}`;
    li.appendChild(span);
    tokensList.appendChild(li);
  }
  header.appendChild(tokensList);

  container.appendChild(header);

  if (gameState.phase !== 'round_setup') {
    const targets: ChatTarget[] = gameState.players
      .filter((p) => p.playerId !== selfPlayerId)
      .map((p) => ({ playerId: p.playerId, name: nameFor(names, p.playerId), prisonerNumber: p.seat + 1 }));

    const chatContainer = document.createElement('div');
    renderChat(chatContainer, targets, callbacks);
    container.appendChild(chatContainer);
  }

  if (gameState.phase === 'round_setup') {
    const placementContainer = document.createElement('div');
    if (gameState.pendingLuckyPlacementOwners.includes(selfPlayerId)) {
      renderLuckyPlacement(placementContainer, handsView, selfPlayerId, gameState.players.length, names, callbacks);
    } else {
      renderWaitingForOthersLuckyPlacement(placementContainer, gameState.pendingLuckyPlacementOwners);
    }
    container.appendChild(placementContainer);
  }

  if (gameState.phase === 'round_active') {
    const ownHand = handsView.hands.find((h) => h.playerId === selfPlayerId);
    const canAct = ownHand !== undefined && !ownHand.busted && !ownHand.stopped && ownHand.flippedCount < ownHand.cardCount;

    const controls = document.createElement('div');
    controls.className = 'panel flip-controls';

    const statusLine = document.createElement('div');
    if (ownHand?.busted === true) {
      statusLine.textContent = '爆弾を引いて脱落しました。他のプレイヤーの結果を待っています…';
    } else if (ownHand?.stopped === true) {
      statusLine.textContent = 'やめました。他のプレイヤーの結果を待っています…';
    } else if (ownHand !== undefined && ownHand.flippedCount >= ownHand.cardCount) {
      statusLine.textContent = '手札を全て使い切りました!他のプレイヤーの結果を待っています…';
    } else {
      statusLine.textContent = '自分の手札の次の1枚をめくりますか、それともここでやめますか?';
    }
    controls.appendChild(statusLine);

    const buttonRow = document.createElement('div');
    buttonRow.className = 'flip-button-row';

    const flipButton = document.createElement('button');
    flipButton.textContent = '次のカードをめくる';
    flipButton.disabled = !canAct;
    flipButton.addEventListener('click', () => callbacks.onFlip());
    buttonRow.appendChild(flipButton);

    const stopButton = document.createElement('button');
    stopButton.className = 'secondary';
    stopButton.textContent = 'やめる';
    stopButton.disabled = !canAct;
    stopButton.addEventListener('click', () => callbacks.onStop());
    buttonRow.appendChild(stopButton);

    controls.appendChild(buttonRow);
    container.appendChild(controls);
  }

  const handsContainer = document.createElement('div');
  renderHandsView(handsContainer, handsView, selfPlayerId, names);
  container.appendChild(handsContainer);

  if (log.roundSummaries.length > 0) {
    const eventLog = document.createElement('div');
    eventLog.className = 'panel event-log';
    for (const r of log.roundSummaries.slice(-1)) {
      const line = document.createElement('div');
      const winnerNames = r.roundWinnerIds.map((id) => (id === selfPlayerId ? 'あなた' : nameFor(names, id))).join(', ');
      line.textContent = `ラウンド${r.roundNo}終了。ラウンド勝者: ${winnerNames || 'なし'} / 座の持ち越し: ${r.potCarryOver}個`;
      eventLog.appendChild(line);
    }
    container.appendChild(eventLog);
  }
}
