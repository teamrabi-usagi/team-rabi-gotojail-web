/**
 * Socket.IO クライアント接続と、再接続トークンの保存。
 *
 * サーバーURLをここに直書きしない。dev は Vite の proxy、prod は同一オリジンで
 * 配信されるため、いずれも既定の接続先(同一オリジン)で足りる。
 *
 * 再接続情報の保存先は`sessionStorage`(タブごとに分離される)。同一ブラウザの
 * 通常タブを複数開くだけで、それぞれ独立したプレイヤーとして扱える。
 */

import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/types.js';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const STORAGE_KEY = 'gotojail:session';

export interface StoredSession {
  readonly code: string;
  readonly reconnectToken: string;
}

export function createSocket(): AppSocket {
  return io();
}

/** 再接続トークンは本人のブラウザ(このタブ)にだけ置く。サーバーが他プレイヤーへ配ることはない。 */
export function saveSession(session: StoredSession): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // プライベートブラウズ等で書けない場合は再接続を諦めるだけ。進行は妨げない。
  }
}

export function loadSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as StoredSession).code !== 'string' ||
      typeof (parsed as StoredSession).reconnectToken !== 'string'
    ) {
      return null;
    }

    return parsed as StoredSession;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // 同上。
  }
}
