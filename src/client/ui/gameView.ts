/**
 * ゲーム画面の描画(round/pot/刑期トークンのヘッダー + round_setup/round_activeの内容)。
 */

import type { PublicGameState } from '../../shared/game/publicState.js';
import type { HandsView } from '../../shared/game/handsView.js';
import type { RoundResolvedSummary } from '../../shared/game/state.js';
import { renderHandsView } from './handsView.js';
import { renderLuckyPlacement, renderWaitingForOthersLuckyPlacement, type LuckyPlacementCallbacks } from './luckyPlacement.js';
import { renderChat, type ChatCallbacks, type ChatTarget } from './chat.js';
import { renderGameEnd } from './gameEnd.js';

export interface GameViewCallbacks extends LuckyPlacementCallbacks, ChatCallbacks {
  readonly onFlip: () => void;
  readonly onStop: () => void;
  readonly onGuardEventRespond: (count: number) => void;
}

export interface GameViewLog {
  readonly roundSummaries: readonly RoundResolvedSummary[];
  readonly winnerIds: readonly string[] | null;
}

const PHASE_ORDER: readonly PublicGameState['phase'][] = ['round_setup', 'round_active', 'round_end', 'game_end'];

const PHASE_LABELS: Record<PublicGameState['phase'], string> = {
  round_setup: '①チャンス挿入',
  round_active: '②めくり',
  round_end: '③精算',
  game_end: '④結果発表',
};

/** 直前に描画したフェーズ。フェーズが実際に変わった瞬間だけ色フラッシュを出すための判定に使う。 */
let lastRenderedPhase: PublicGameState['phase'] | null = null;

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

  const phaseChanged = lastRenderedPhase !== null && lastRenderedPhase !== gameState.phase;
  lastRenderedPhase = gameState.phase;

  const phaseStepper = document.createElement('div');
  phaseStepper.className = 'phase-stepper';
  for (const phase of PHASE_ORDER) {
    const isActive = phase === gameState.phase;
    const step = document.createElement('div');
    step.className = `phase-step${isActive ? ` phase-step--active phase-badge--${phase}${phaseChanged ? ' phase-badge--flash' : ''}` : ''}`;
    step.textContent = PHASE_LABELS[phase];
    phaseStepper.appendChild(step);
  }
  container.appendChild(phaseStepper);

  if (log.winnerIds !== null) {
    renderGameEnd(container, gameState, selfPlayerId, names, log.winnerIds);
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
  } else if (gameState.phase === 'round_active' && gameState.pendingGuardEvent !== null) {
    const pausedLabel = document.createElement('div');
    pausedLabel.textContent = '⏸ 看守イベントのため一時停止中';
    header.appendChild(pausedLabel);
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

  if (gameState.phase === 'round_active' && gameState.pendingGuardEvent !== null) {
    const pending = gameState.pendingGuardEvent;
    const isTarget = pending.targetPlayerId === selfPlayerId;
    const directionLabel = pending.direction === 'left' ? '左隣' : '右隣';
    const targetLabel = isTarget ? 'あなた' : `囚人${pending.targetPrisonerNumber}番 ${nameFor(names, pending.targetPlayerId)}`;
    const neighborLabel = pending.neighborPlayerId === selfPlayerId ? 'あなた' : nameFor(names, pending.neighborPlayerId);

    const panel = document.createElement('div');
    panel.className = 'panel guard-event-panel';

    const headline = document.createElement('div');
    headline.className = 'guard-event-headline';
    headline.textContent = '🔔 看守イベント発生!';
    panel.appendChild(headline);

    const cardText = document.createElement('div');
    cardText.className = 'guard-event-card-text';
    cardText.textContent = `「囚人番号${pending.targetPrisonerNumber}番!お前の${directionLabel}のプレイヤーはあと何枚捨てられる?嘘をついてもいいぞ」`;
    panel.appendChild(cardText);

    if (isTarget) {
      const prompt = document.createElement('div');
      prompt.textContent = `${neighborLabel}は、あと何枚捨てられますか?`;
      panel.appendChild(prompt);

      const row = document.createElement('div');
      row.className = 'guard-event-response-row';
      for (let count = 1; count <= 8; count++) {
        const btn = document.createElement('button');
        btn.className = 'chat-chip';
        btn.textContent = String(count);
        btn.addEventListener('click', () => callbacks.onGuardEventRespond(count));
        row.appendChild(btn);
      }
      panel.appendChild(row);
    } else {
      const waiting = document.createElement('div');
      waiting.className = 'guard-event-waiting';
      waiting.textContent = `${targetLabel}の回答を待っています…`;
      panel.appendChild(waiting);
    }

    container.appendChild(panel);
  }

  if (gameState.phase === 'round_active' && gameState.pendingGuardEvent === null) {
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
