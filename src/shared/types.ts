/**
 * 型定義の唯一の出所。src/server と src/client はここから import する。
 * Socket.IOイベント型はPhase 1以降で ClientToServerEvents / ServerToClientEvents を追加する。
 */

export type PlayerCount = 2 | 3 | 4 | 5;

export function isPlayerCount(n: number): n is PlayerCount {
  return n === 2 || n === 3 || n === 4 || n === 5;
}

/** 乱数源。テストでは決定的な関数を渡す。本番コードでは Math.random() を直接使わない。 */
export type Rng = () => number;

/** カード種類。「終了カード」は物理版専用の向き目印でデジタル版には存在しない。 */
export type CardKind = 'plain' | 'guard' | 'lucky' | 'bomb';

export function isSafeKind(kind: CardKind): boolean {
  return kind !== 'bomb';
}

// ---------------------------------------------------------------------------
// ルーム / プレイヤー（Phase 1の範囲）
// ---------------------------------------------------------------------------

export type RoomStatus = 'lobby' | 'playing' | 'finished';

/** 全員へ配ってよいプレイヤー情報。reconnectToken は絶対に含めない。 */
export interface PublicPlayer {
  readonly id: string;
  readonly name: string;
  readonly isHost: boolean;
  readonly connected: boolean;
}

/** 全員へ配ってよいルーム情報。 */
export interface PublicRoomState {
  readonly code: string;
  readonly status: RoomStatus;
  readonly players: readonly PublicPlayer[];
  readonly minPlayers: number;
  readonly maxPlayers: number;
}

/** 参加/再接続に成功した本人だけに送る情報（他プレイヤーへbroadcastしない）。 */
export interface SelfIdentity {
  readonly playerId: string;
  /** sessionStorageへ保存し、再接続時に提示する。本人のsocketにのみ送る。 */
  readonly reconnectToken: string;
}

// game:* イベントのpayload型は src/shared/game/{publicState,handsView,state}.ts が出所。
// type-only importなので実行時の循環importにはならない（verbatimModuleSyntax）。
import type { PublicGameState } from './game/publicState.js';
import type { HandsView } from './game/handsView.js';
import type { RoundResolvedSummary } from './game/state.js';

export interface GuardResolvedEvent {
  readonly drawerPlayerId: string;
  readonly targetPlayerId: string;
  readonly zone2Before: number;
  readonly zone2After: number;
  readonly flooredAtZero: boolean;
}

export interface ChatMessage {
  readonly id: string;
  readonly playerId: string;
  readonly text: string;
  readonly at: number;
}

// ---------------------------------------------------------------------------
// Socket.IO イベント（docs/WEB_ARCHITECTURE.md §3）
// ---------------------------------------------------------------------------

export interface ClientToServerEvents {
  'room:create': (payload: { name: string }) => void;
  'room:join': (payload: { code: string; name: string }) => void;
  'room:reconnect': (payload: { code: string; reconnectToken: string }) => void;
  'room:leave': () => void;
  /** hostのみ。lobby中の2〜5人roomでゲームを開始する。 */
  'game:start': () => void;
  /** 座席iの持ち主が、自分のラッキーカードを座席(i+1)%nの手札に挿入する位置を選ぶ。 */
  'game:luckyPlacement:submit': (payload: { position: number }) => void;
  /** 自分の手札の次の1枚をめくる。手番の順序はない。 */
  'game:flip': () => void;
  /** このラウンドはこれ以上めくらないと宣言する。 */
  'game:stop': () => void;
  'chat:send': (payload: { text: string }) => void;
}

export interface ServerToClientEvents {
  /** 本人のみ。SelfIdentity を含むため broadcast 禁止。 */
  'room:joined': (payload: { self: SelfIdentity; room: PublicRoomState }) => void;
  /** ルーム全員へ。公開情報のみ。 */
  'room:state': (payload: PublicRoomState) => void;
  'room:error': (payload: { code: string; message: string }) => void;
  /** reconnect tokenで別socketが同じplayerとして接続し直したとき、引き継がれた側（旧socket）へ送る。 */
  'session:replaced': (payload: { message: string }) => void;
  /** ルーム全員へ。公開情報のみ(カード種別データは含まない)。 */
  'game:state': (payload: PublicGameState) => void;
  /** 本人のsocketへの個別emit限定。`io.to(room).emit`には絶対に載せない(docs/WEB_ARCHITECTURE.md §6)。 */
  'game:handsView': (payload: HandsView) => void;
  'game:error': (payload: { code: string; message: string }) => void;
  /** ルーム全員へ。看守(没収)カードの効果は完全に公開情報。 */
  'game:guard:resolved': (payload: GuardResolvedEvent) => void;
  /** ルーム全員へ。ラウンド終了時の①②精算・座精算の一時的な表示用サマリ(GameStateには保存されない)。 */
  'game:round:resolved': (payload: RoundResolvedSummary) => void;
  /** ルーム全員へ。4ラウンド終了時。同率優勝あり。 */
  'game:ended': (payload: { winnerIds: readonly string[] }) => void;
  'chat:message': (payload: ChatMessage) => void;
}
