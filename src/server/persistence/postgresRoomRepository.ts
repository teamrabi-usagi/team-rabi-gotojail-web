/**
 * `RoomRepository`のPostgreSQL実装。`DATABASE_URL`経由で接続する(Neon等)。
 * ORMは使わず、軽量な`pg`(node-postgres)だけを使う。スキーマはroom codeごとに
 * 1行、snapshot全体をJSONBで持つだけの単純な構造。マイグレーションツールも使わず、
 * 起動時に`CREATE TABLE IF NOT EXISTS`を1回実行するだけの最小構成。
 *
 * 書き込みはroom codeごとにFIFOで直列化する(`KeyedWriteQueue`)。同じroomへの
 * ほぼ同時の複数`save()`で、DBへの到達順序が呼び出し順と一致しない問題を防ぐため。
 */

import pg from 'pg';
import type { RoomRepository } from './roomRepository.js';
import type { RoomSnapshot } from './roomSnapshot.js';
import { KeyedWriteQueue } from './keyedWriteQueue.js';

const { Pool } = pg;

const TABLE_NAME = 'gotojail_room_snapshots';

export class PostgresRoomRepository implements RoomRepository {
  private readonly pool: pg.Pool;
  private schemaReady: Promise<void> | null = null;
  private readonly writeQueue = new KeyedWriteQueue();

  constructor(connectionString: string) {
    // Render/多くのfree-tier外部Postgres(Neon・Supabase等)はSSL必須かつ
    // 自己署名/managed証明書のことが多いため、`rejectUnauthorized: false`で接続する。
    this.pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  }

  private async ensureSchema(): Promise<void> {
    this.schemaReady ??= this.pool
      .query(
        `CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
          code TEXT PRIMARY KEY,
          snapshot JSONB NOT NULL,
          updated_at BIGINT NOT NULL
        )`,
      )
      .then(() => undefined);
    await this.schemaReady;
  }

  async save(code: string, snapshot: RoomSnapshot): Promise<void> {
    await this.writeQueue.enqueue(code, async () => {
      await this.ensureSchema();
      await this.pool.query(
        `INSERT INTO ${TABLE_NAME} (code, snapshot, updated_at)
         VALUES ($1, $2::jsonb, $3)
         ON CONFLICT (code) DO UPDATE SET snapshot = $2::jsonb, updated_at = $3`,
        [code, JSON.stringify(snapshot), snapshot.updatedAt],
      );
    });
  }

  async load(code: string): Promise<RoomSnapshot | null> {
    await this.ensureSchema();
    const result = await this.pool.query<{ snapshot: RoomSnapshot }>(
      `SELECT snapshot FROM ${TABLE_NAME} WHERE code = $1`,
      [code],
    );
    return result.rows[0]?.snapshot ?? null;
  }

  async delete(code: string): Promise<void> {
    await this.writeQueue.enqueue(code, async () => {
      await this.ensureSchema();
      await this.pool.query(`DELETE FROM ${TABLE_NAME} WHERE code = $1`, [code]);
    });
    this.writeQueue.forget(code);
  }

  async purgeExpired(cutoffUpdatedAt: number): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(`DELETE FROM ${TABLE_NAME} WHERE updated_at < $1`, [cutoffUpdatedAt]);
  }

  /** テスト/graceful shutdown用。通常運用のRender Web Serviceでは呼ばなくてよい。 */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
