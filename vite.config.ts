import { defineConfig } from 'vite';

// クライアント（src/client）専用の設定。
// dev時のSocket.IOは同一オリジンに見せたいので /socket.io を Express + Socket.IO
// （既定 3000番）へproxyする。クライアントのコードにサーバーURLを直書きしない。
export default defineConfig({
  root: 'src/client',
  // root を src/client にしているため、既定の publicDir（root相対の 'public'）は
  // src/client/public を指してしまう。静的アセットはリポジトリ直下の public/ に
  // 置く運用のため、明示的に指し直す。
  publicDir: '../../public',
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
});
