# GOTOJAIL!(刑務所に行け!) — Web版

全員が罪を背負った罪人!独房で刑期を賭けたゲームを行う、ブラフ&チキンレースカードゲーム。

自分の手札だけが自分に見えない(他の全員には見えている)という情報非対称性が核心メカニクス。
Team RABIによるアナログゲームのWeb版(ネットワーク対戦)。

## 技術構成

Node.js + TypeScript / Express / Socket.IO / Vite + Vanilla TypeScript / Vitest。
サーバー権威型。ルーム/ゲーム状態はin-memoryを主とし、`DATABASE_URL`環境変数を
設定すると外部の無料枠PostgreSQL(Neon等)へも永続化される(プロセス再起動・再デプロイを
またいだ復元。未設定でも動作するが、その場合はプロセス再起動でルーム/ゲーム状態が
失われる従来通りの挙動になる)。

ルールの詳細は `docs/RULE_SPEC.md`、通信・秘匿情報の扱いは `docs/WEB_ARCHITECTURE.md` を参照。

## 必要なもの

- Node.js 20 以上

## セットアップ

```bash
npm install
```

## ローカルでの起動(開発)

**ターミナルを2つ使う。**

```bash
# 1つ目: Express + Socket.IO サーバー(http://localhost:3000)
npm run dev:server

# 2つ目: Vite クライアント(http://localhost:5173)
npm run dev:client
```

ブラウザで <http://localhost:5173> を開く。Vite が `/socket.io` を :3000 のサーバーへ
proxyするので、クライアント側にサーバーURLを書く必要はない。

複数人での動作を確認するときは、**同じブラウザの通常タブを人数分(2〜5)開くだけでよい**。
1つ目のタブで「新しいルームを作る」→ 表示されたルームコードを他のタブで入力して参加する。

> `reconnectToken` は`sessionStorage`(キー `gotojail:session`)に保存される。
> `sessionStorage`はタブごとに分離されるため、同じ通常タブを複数開くだけで、それぞれ
> 独立したプレイヤーとして扱える。各タブをF5でリロードしても、そのタブ自身の
> プレイヤーとして再接続できる(タブを完全に閉じるとそのタブのセッション情報は消える)。

## 本番相当での起動

```bash
npm ci
npm run build
npm start          # http://localhost:3000 でサーバーとクライアントの両方を配信
```

ポートは環境変数 `PORT` で変更できる(既定 3000)。Renderにデプロイする場合は
`render.yaml` から1つのWeb Serviceとして構築できる。

### durable persistence(プロセス再起動・再デプロイをまたいだ復元)

`DATABASE_URL` 環境変数(外部PostgreSQLの接続文字列。Neon等の無料枠を想定)を設定すると、
ルーム作成・ゲーム進行のたびにその状態を外部DBへ保存し、Render側のプロセス再起動・
sleep/wake・再デプロイでサーバーのメモリが失われても、ルームコードと再接続コードがあれば
元のプレイヤーとして復帰できるようになる。**未設定の場合、この永続化は無効化され、
従来通りプロセス再起動でルーム/ゲーム状態が失われる。** キー名は `.env.example` を参照。

## テストと型チェック

```bash
npm test        # Vitest(ゲームルール・ルーム管理・socket統合・4ラウンド通しシミュレーション)
npm run typecheck
```

## ディレクトリ

```
src/
  shared/     型定義とゲームルールの純粋ロジック(Express/Socket.IO/DOMに依存しない)
    rules/    deck / luckyPlacement / tokens / ante / flip / roundResolution
    game/     GameState・engine(ラウンド進行〜勝敗判定)・handsView(個別視点マスク)・公開state
  server/     Express + Socket.IO + ルーム管理 + ゲームセッション管理 + ラウンドタイマー
  client/     Vite + Vanilla TypeScript
public/       静的アセット(Viteの publicDir)
tests/        Vitest。src/shared と src/server を直接importする
docs/         ルール仕様・アーキテクチャ
```

## 注意

- ゲームのルールは原作者(Team RABI)の著作物。
- 秘密情報(自分以外のカードの内容は全員に見えるが、自分の未オープンの手札は自分には
  見えない。reconnect tokenも同様)はサーバー側で視点ごとに切り分けて個別送信する。
  全部送ってCSSで隠すことはしない。
- 秘密の値(トークン・接続文字列等)をリポジトリにコミットしない。
