/**
 * `RoomRepository`のin-memory実装。local開発・testでの`DATABASE_URL`未設定時の
 * fallback専用。これ自体はプロセスを跨いでは永続化されない。
 */

import type { RoomRepository } from './roomRepository.js';
import type { RoomSnapshot } from './roomSnapshot.js';

export class MemoryRoomRepository implements RoomRepository {
  private readonly snapshots = new Map<string, RoomSnapshot>();

  async save(code: string, snapshot: RoomSnapshot): Promise<void> {
    this.snapshots.set(code, snapshot);
  }

  async load(code: string): Promise<RoomSnapshot | null> {
    return this.snapshots.get(code) ?? null;
  }

  async delete(code: string): Promise<void> {
    this.snapshots.delete(code);
  }

  async purgeExpired(cutoffUpdatedAt: number): Promise<void> {
    for (const [code, snapshot] of this.snapshots) {
      if (snapshot.updatedAt < cutoffUpdatedAt) {
        this.snapshots.delete(code);
      }
    }
  }
}
