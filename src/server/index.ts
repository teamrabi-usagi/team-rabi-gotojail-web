/**
 * Express + Socket.IO のエントリポイント。
 *
 * dev: Viteが :5173 でクライアントを配信し、`/socket.io` を :3000 の本サーバーへproxyする。
 * prod: `npm run build` 後、このサーバーが dist/client を静的配信する。
 */

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/types.js';
import { RoomStore } from './rooms/roomStore.js';
import { GameManager } from './game/gameManager.js';
import { startRoundTimerWatcher } from './game/roundTimer.js';
import { DEFAULT_ROOM_SNAPSHOT_TTL_MS, registerSocketHandlers } from './socket/handlers.js';
import type { RoomRepository } from './persistence/roomRepository.js';
import { MemoryRoomRepository } from './persistence/memoryRoomRepository.js';
import { PostgresRoomRepository } from './persistence/postgresRoomRepository.js';

const PORT = Number(process.env['PORT'] ?? 3000);

// dev は <repo>/src/server、prod は <repo>/dist/server から動くので、どちらも
// ../../dist/client がビルド済みクライアントを指す(tsconfig.server.json の outDir)。
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, '../../dist/client');

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);

const store = new RoomStore();
const gameManager = new GameManager();

// `DATABASE_URL`が設定されていればdurable Postgres(Neon等)を使い、無ければ
// 従来通りのin-memory fallbackで動く。Render Web Service自体は無料プランのままで、
// 外部free-tier Postgresへ`DATABASE_URL`経由で接続する構成を想定している。
const databaseUrl = process.env['DATABASE_URL'];
const isDurable = databaseUrl !== undefined && databaseUrl.length > 0;
const repository: RoomRepository = isDurable ? new PostgresRoomRepository(databaseUrl) : new MemoryRoomRepository();

const snapshotTtlMs = Number(process.env['ROOM_SNAPSHOT_TTL_MS'] ?? DEFAULT_ROOM_SNAPSHOT_TTL_MS);

registerSocketHandlers(io, store, gameManager, repository, snapshotTtlMs);
startRoundTimerWatcher(io, store, gameManager, repository);

if (isDurable) {
  console.log('[gotojail-web] persistence: durable (PostgreSQL via DATABASE_URL) — rooms survive process restarts');
} else {
  console.log(
    '[gotojail-web] persistence: in-memory only (DATABASE_URL not set) — rooms will NOT survive process restarts/redeploys',
  );
}

// 期限切れになった非アクティブroomのsnapshotを定期的に掃除する。1時間ごと。
const PURGE_INTERVAL_MS = 60 * 60 * 1000;
setInterval(() => {
  repository.purgeExpired(Date.now() - snapshotTtlMs).catch((err: unknown) => {
    console.error('[persistence] purgeExpired failed:', err);
  });
}, PURGE_INTERVAL_MS).unref();

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, rooms: store.roomCount(), durablePersistence: isDurable });
});

// ビルド済みクライアントがあれば配信する(dev時は存在しないので何も起きない)。
app.use(express.static(clientDist));

httpServer.listen(PORT, () => {
  console.log(`[gotojail-web] server listening on http://localhost:${PORT}`);
});
