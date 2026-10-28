/**
 * reconnectTokenのhash化。raw tokenをそのままdurable storageへ保存しない。
 * SHA-256のhexダイジェストだけを`RoomPlayer.reconnectTokenHash`として保持し、
 * 提示されたraw tokenをhashして照合する。
 */

import { createHash } from 'node:crypto';

export function hashReconnectToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}
