/**
 * 簡易チャットパネル。サーバー側は内容の真偽を一切検証しない(ブラフ/駆け引き用)。
 */

import type { ChatMessage } from '../../shared/types.js';

export interface ChatCallbacks {
  readonly onSend: (text: string) => void;
}

export function renderChat(container: HTMLElement, messages: readonly ChatMessage[], selfPlayerId: string, callbacks: ChatCallbacks): void {
  container.innerHTML = '';
  container.className = 'panel chat-panel';

  const list = document.createElement('div');
  list.className = 'chat-messages';
  for (const msg of messages) {
    const line = document.createElement('div');
    line.className = 'chat-line';
    const isSelf = msg.playerId === selfPlayerId;
    line.innerHTML = '';
    const nameSpan = document.createElement('span');
    nameSpan.className = isSelf ? 'you' : '';
    nameSpan.textContent = `${isSelf ? 'あなた' : msg.playerId}: `;
    line.appendChild(nameSpan);
    const textSpan = document.createElement('span');
    textSpan.textContent = msg.text;
    line.appendChild(textSpan);
    list.appendChild(line);
  }
  container.appendChild(list);
  list.scrollTop = list.scrollHeight;

  const form = document.createElement('div');
  form.className = 'chat-form';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'ブラフをかける…(例: まだ3枚は大丈夫ですよ)';
  input.maxLength = 200;
  form.appendChild(input);

  const sendButton = document.createElement('button');
  sendButton.textContent = '送信';
  const send = (): void => {
    const text = input.value.trim();
    if (text.length === 0) {
      return;
    }
    callbacks.onSend(text);
    input.value = '';
  };
  sendButton.addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      send();
    }
  });
  form.appendChild(sendButton);

  container.appendChild(form);
}
