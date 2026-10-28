/**
 * ロビー画面の描画(接続・ルーム作成/参加/退出)。Phase 1の範囲。
 */

import type { PublicRoomState } from '../../shared/types.js';

export interface LobbyFormCallbacks {
  readonly onCreate: (name: string) => void;
  readonly onJoin: (code: string, name: string) => void;
}

export function renderLobbyForm(container: HTMLElement, callbacks: LobbyFormCallbacks, errorMessage: string | null): void {
  container.innerHTML = '';

  const title = document.createElement('h1');
  title.textContent = '🔒 GOTOJAIL!(刑務所に行け!)';
  container.appendChild(title);

  if (errorMessage !== null) {
    const error = document.createElement('div');
    error.className = 'error';
    error.textContent = errorMessage;
    container.appendChild(error);
  }

  const panel = document.createElement('div');
  panel.className = 'panel';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = '表示名(例: うさぎA)';
  nameInput.maxLength = 20;
  panel.appendChild(nameInput);

  const createButton = document.createElement('button');
  createButton.textContent = '新しいルームを作る';
  createButton.addEventListener('click', () => {
    callbacks.onCreate(nameInput.value);
  });
  panel.appendChild(createButton);

  container.appendChild(panel);

  const joinPanel = document.createElement('div');
  joinPanel.className = 'panel';

  const joinNameInput = document.createElement('input');
  joinNameInput.type = 'text';
  joinNameInput.placeholder = '表示名(例: うさぎB)';
  joinNameInput.maxLength = 20;
  joinPanel.appendChild(joinNameInput);

  const codeInput = document.createElement('input');
  codeInput.type = 'text';
  codeInput.placeholder = 'ルームコード(4文字)';
  codeInput.maxLength = 4;
  codeInput.style.textTransform = 'uppercase';
  joinPanel.appendChild(codeInput);

  const joinButton = document.createElement('button');
  joinButton.className = 'secondary';
  joinButton.textContent = 'ルームに参加する';
  joinButton.addEventListener('click', () => {
    callbacks.onJoin(codeInput.value, joinNameInput.value);
  });
  joinPanel.appendChild(joinButton);

  container.appendChild(joinPanel);
}

export function renderReconnecting(container: HTMLElement): void {
  container.innerHTML = '';
  const title = document.createElement('h1');
  title.textContent = '🔒 GOTOJAIL!(刑務所に行け!)';
  container.appendChild(title);

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.textContent = '再接続中…';
  container.appendChild(panel);
}

export interface WaitingRoomCallbacks {
  readonly onLeave: () => void;
  readonly onStart: () => void;
}

export function renderWaitingRoom(
  container: HTMLElement,
  room: PublicRoomState,
  selfPlayerId: string,
  callbacks: WaitingRoomCallbacks,
): void {
  container.innerHTML = '';

  const title = document.createElement('h1');
  title.textContent = '🔒 GOTOJAIL!(刑務所に行け!)';
  container.appendChild(title);

  const panel = document.createElement('div');
  panel.className = 'panel';

  const codeLabel = document.createElement('div');
  codeLabel.textContent = 'このコードを他のプレイヤーに共有してください';
  panel.appendChild(codeLabel);

  const code = document.createElement('div');
  code.className = 'room-code';
  code.textContent = room.code;
  panel.appendChild(code);

  const list = document.createElement('ul');
  list.className = 'player-list';
  for (const player of room.players) {
    const li = document.createElement('li');
    const isSelf = player.id === selfPlayerId;

    const nameSpan = document.createElement('span');
    nameSpan.className = isSelf ? 'you' : player.connected ? '' : 'disconnected';
    nameSpan.textContent = `${player.name}${isSelf ? '(あなた)' : ''}${player.connected ? '' : '(切断中)'}`;
    li.appendChild(nameSpan);

    if (player.isHost) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'ホスト';
      li.appendChild(badge);
    }

    list.appendChild(li);
  }
  panel.appendChild(list);

  const countLabel = document.createElement('div');
  countLabel.textContent = `${room.players.length} / ${room.maxPlayers}人 (最低${room.minPlayers}人)`;
  panel.appendChild(countLabel);

  container.appendChild(panel);

  const self = room.players.find((p) => p.id === selfPlayerId);
  if (self?.isHost === true) {
    const startButton = document.createElement('button');
    startButton.textContent = 'ゲームを開始する';
    startButton.disabled = room.players.length < room.minPlayers;
    startButton.addEventListener('click', () => {
      callbacks.onStart();
    });
    container.appendChild(startButton);
  }

  const leaveButton = document.createElement('button');
  leaveButton.className = 'secondary';
  leaveButton.textContent = 'ルームを退出する';
  leaveButton.addEventListener('click', () => {
    callbacks.onLeave();
  });
  container.appendChild(leaveButton);
}
