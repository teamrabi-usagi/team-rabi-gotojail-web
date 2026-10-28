/**
 * 接続・イベント配線。`room:state`/`game:state`/`game:handsView`を受けて描画を更新する。
 */

import type { ChatMessage, PublicRoomState, SelfIdentity } from '../shared/types.js';
import type { PublicGameState } from '../shared/game/publicState.js';
import type { HandsView } from '../shared/game/handsView.js';
import type { RoundResolvedSummary } from '../shared/game/state.js';
import { createSocket, loadSession, saveSession, clearSession, type AppSocket } from './socket.js';
import { renderLobbyForm, renderReconnecting, renderWaitingRoom } from './ui/lobby.js';
import { renderGameView } from './ui/gameView.js';

const appRoot = document.getElementById('app');
if (appRoot === null) {
  throw new Error('main.ts: #app not found');
}
const app: HTMLElement = appRoot;

let self: SelfIdentity | null = null;
let currentRoom: PublicRoomState | null = null;
let currentGameState: PublicGameState | null = null;
let currentHandsView: HandsView | null = null;
let winnerIds: readonly string[] | null = null;

const roundSummaries: RoundResolvedSummary[] = [];
const chatMessages: ChatMessage[] = [];

function namesMap(): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  if (currentRoom !== null) {
    for (const p of currentRoom.players) {
      map.set(p.id, p.name);
    }
  }
  return map;
}

function showLobbyForm(errorMessage: string | null): void {
  renderLobbyForm(
    app,
    {
      onCreate: (name) => socket.emit('room:create', { name }),
      onJoin: (code, name) => socket.emit('room:join', { code, name }),
    },
    errorMessage,
  );
}

function showWaitingRoom(): void {
  if (self === null || currentRoom === null) {
    return;
  }
  renderWaitingRoom(app, currentRoom, self.playerId, {
    onLeave: () => {
      socket.emit('room:leave');
      clearSession();
      self = null;
      currentRoom = null;
      showLobbyForm(null);
    },
    onStart: () => {
      socket.emit('game:start');
    },
  });
}

function showGameView(): void {
  if (self === null || currentGameState === null || currentHandsView === null) {
    return;
  }
  renderGameView(
    app,
    currentGameState,
    currentHandsView,
    self.playerId,
    namesMap(),
    { roundSummaries, chatMessages, winnerIds },
    {
      onSubmit: (position) => socket.emit('game:luckyPlacement:submit', { position }),
      onFlip: () => socket.emit('game:flip'),
      onStop: () => socket.emit('game:stop'),
      onSend: (text) => socket.emit('chat:send', { text }),
    },
  );
}

function render(): void {
  if (self === null) {
    return;
  }
  if (currentGameState !== null && currentHandsView !== null) {
    showGameView();
  } else {
    showWaitingRoom();
  }
}

const socket: AppSocket = createSocket();

socket.on('connect', () => {
  const session = loadSession();
  if (session !== null) {
    renderReconnecting(app);
    socket.emit('room:reconnect', { code: session.code, reconnectToken: session.reconnectToken });
    return;
  }

  showLobbyForm(null);
});

socket.on('room:joined', (payload) => {
  self = payload.self;
  currentRoom = payload.room;
  saveSession({ code: payload.room.code, reconnectToken: payload.self.reconnectToken });
  render();
});

socket.on('room:state', (room) => {
  currentRoom = room;
  if (self !== null) {
    render();
  }
});

socket.on('game:state', (gameState) => {
  currentGameState = gameState;
  if (self !== null) {
    render();
  }
});

socket.on('game:handsView', (handsView) => {
  currentHandsView = handsView;
  if (self !== null) {
    render();
  }
});

socket.on('game:round:resolved', (summary) => {
  roundSummaries.push(summary);
  render();
});

socket.on('game:ended', (payload) => {
  winnerIds = payload.winnerIds;
  render();
});

socket.on('chat:message', (message) => {
  chatMessages.push(message);
  render();
});

socket.on('room:error', (err) => {
  if (self === null) {
    clearSession();
    showLobbyForm(err.message);
  } else {
    // 既にルームに参加済みの状態でのエラーは、今の画面を保ったまま
    // 今後ui側でトースト表示を追加する。
    console.error('[room:error]', err);
  }
});

socket.on('game:error', (err) => {
  // 不正な配置・不正なめくり等。今の画面を保ったままログに出す(トースト表示は将来追加)。
  console.error('[game:error]', err);
});

socket.on('session:replaced', (payload) => {
  console.warn('[session:replaced]', payload.message);
});

// round_active中、残り時間の表示を1秒ごとに更新するためだけの再描画(通信は発生しない)。
setInterval(() => {
  if (self !== null && currentGameState?.phase === 'round_active') {
    render();
  }
}, 1000);
