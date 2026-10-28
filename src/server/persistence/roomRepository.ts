/**
 * Room(+GameState)のdurable persistence層のinterface。
 * provider固有ロジック(Postgres等)をゲームコードへ直書きしないための抽象。
 * 実装は`memoryRoomRepository.ts`(local/test用fallback)と
 * `postgresRoomRepository.ts`(本番用、`DATABASE_URL`経由)の2つ。
 */

import type { RoomSnapshot } from './roomSnapshot.js';

export interface RoomRepository {
  /** room codeごとに1件のsnapshotをupsertする。 */
  save(code: string, snapshot: RoomSnapshot): Promise<void>;
  /** 見つからなければnull。 */
  load(code: string): Promise<RoomSnapshot | null>;
  delete(code: string): Promise<void>;
  /** `updatedAt < cutoffUpdatedAt`のsnapshotをすべて削除する(TTL cleanup)。 */
  purgeExpired(cutoffUpdatedAt: number): Promise<void>;
}
