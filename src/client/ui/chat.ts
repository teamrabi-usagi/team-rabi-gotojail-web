/**
 * ブラフ用の定型メッセージ送信パネル。
 * サーバーは内容の真偽を一切検証しない(ブラフ/駆け引き用)。
 *
 * 自由入力ではなく、「誰(囚人番号)へ」「あと何枚は捨てられる(安全)と伝えるか」を
 * ボタンだけで組み立てて送る。選択状態はこのモジュール内に保持し、送信後にリセットする。
 */

import type { ChatMessage } from '../../shared/types.js';

export interface ChatCallbacks {
  readonly onSend: (text: string) => void;
}

export interface ChatTarget {
  readonly playerId: string;
  readonly name: string;
  readonly prisonerNumber: number;
}

const MAX_COUNT = 8;

let selectedTargetId: string | null = null;
let selectedCount: number | null = null;

function nameFor(names: ReadonlyMap<string, string>, playerId: string): string {
  return names.get(playerId) ?? '(不明なプレイヤー)';
}

export function renderChat(
  container: HTMLElement,
  messages: readonly ChatMessage[],
  selfPlayerId: string,
  names: ReadonlyMap<string, string>,
  targets: readonly ChatTarget[],
  callbacks: ChatCallbacks,
): void {
  container.innerHTML = '';
  container.className = 'panel chat-panel';

  const list = document.createElement('div');
  list.className = 'chat-messages';
  for (const msg of messages) {
    const line = document.createElement('div');
    line.className = 'chat-line';
    const isSelf = msg.playerId === selfPlayerId;
    const nameSpan = document.createElement('span');
    nameSpan.className = isSelf ? 'you' : '';
    nameSpan.textContent = `${isSelf ? 'あなた' : nameFor(names, msg.playerId)}: `;
    line.appendChild(nameSpan);
    const textSpan = document.createElement('span');
    textSpan.textContent = msg.text;
    line.appendChild(textSpan);
    list.appendChild(line);
  }
  container.appendChild(list);
  list.scrollTop = list.scrollHeight;

  // 選択済みのtargetがもういない(退室等)場合はリセットする。
  if (selectedTargetId !== null && !targets.some((t) => t.playerId === selectedTargetId)) {
    selectedTargetId = null;
  }

  const form = document.createElement('div');
  form.className = 'chat-form';

  const targetLabel = document.createElement('div');
  targetLabel.className = 'chat-form-label';
  targetLabel.textContent = '誰へ伝える?';
  form.appendChild(targetLabel);

  const targetRow = document.createElement('div');
  targetRow.className = 'chat-target-row';
  for (const target of targets) {
    const btn = document.createElement('button');
    btn.className = `chat-chip${selectedTargetId === target.playerId ? ' chat-chip--active' : ''}`;
    btn.textContent = `囚人${target.prisonerNumber}番 ${target.name}`;
    btn.addEventListener('click', () => {
      selectedTargetId = target.playerId;
      renderChat(container, messages, selfPlayerId, names, targets, callbacks);
    });
    targetRow.appendChild(btn);
  }
  form.appendChild(targetRow);

  const countLabel = document.createElement('div');
  countLabel.className = 'chat-form-label';
  countLabel.textContent = 'あと何枚は捨てられる(安全)と伝える?';
  form.appendChild(countLabel);

  const countRow = document.createElement('div');
  countRow.className = 'chat-count-row';
  for (let count = 0; count <= MAX_COUNT; count++) {
    const btn = document.createElement('button');
    btn.className = `chat-chip${selectedCount === count ? ' chat-chip--active' : ''}`;
    btn.textContent = String(count);
    btn.addEventListener('click', () => {
      selectedCount = count;
      renderChat(container, messages, selfPlayerId, names, targets, callbacks);
    });
    countRow.appendChild(btn);
  }
  form.appendChild(countRow);

  const sendButton = document.createElement('button');
  sendButton.textContent = 'この内容で伝える';
  sendButton.disabled = selectedTargetId === null || selectedCount === null;
  sendButton.addEventListener('click', () => {
    if (selectedTargetId === null || selectedCount === null) {
      return;
    }
    const target = targets.find((t) => t.playerId === selectedTargetId);
    if (target === undefined) {
      return;
    }
    callbacks.onSend(`囚人${target.prisonerNumber}番(${target.name})へ: あと${selectedCount}枚は捨てられるはずです`);
    selectedTargetId = null;
    selectedCount = null;
    renderChat(container, messages, selfPlayerId, names, targets, callbacks);
  });
  form.appendChild(sendButton);

  container.appendChild(form);
}
