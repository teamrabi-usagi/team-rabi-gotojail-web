# WEB_ARCHITECTURE — GOTOJAIL! Web版のアーキテクチャ

前提: `docs/RULE_SPEC.md`(ルール)。

## 0. 全体像

```
ブラウザ (Vite + Vanilla TS)
    │  Socket.IO(同一オリジン。devはViteが/socket.ioを:3000へproxy)
    ▼
Express + Socket.IO  ← サーバー権威。ルールの判定はすべてここ
    │
    ├─ src/server/rooms/    ルーム(in-memory、DATABASE_URL設定時はdurable)
    ├─ src/server/game/     GameManager + roundTimer(5分タイマーの強制)
    ├─ src/server/socket/   イベント配線
    └─ src/shared/rules/    ★ ゲームルールの純粋ロジック(client/testsからも参照)
```

**サーバー権威型**。クライアントが送るのは「意図」だけで、合法性の判定と状態の更新は
すべてサーバーが行う。クライアントの申告(自分の手札の内容等)は一切信用しない。

### ディレクトリ

| パス | 役割 | 依存してよいもの |
| --- | --- | --- |
| `src/shared/` | 型定義とゲームルールの純粋ロジック | **なし**(Express/Socket.IO/DOM禁止) |
| `src/server/` | HTTP/Socket.IO/ルーム管理/ゲームセッション管理 | `src/shared` + Node標準 + express + socket.io + pg |
| `src/client/` | 画面 | `src/shared` + DOM + socket.io-client |
| `tests/` | Vitest | `src/shared`と`src/server`を直接import |

`src/client`が`src/server`を、`src/server`が`src/client`をimportしてはならない。

## 1. サーバー(`src/server/index.ts`)

| 項目 | 内容 |
| --- | --- |
| HTTP | Express。`/healthz`と、ビルド済みクライアントの静的配信 |
| ポート | 環境変数`PORT`(既定3000) |
| WebSocket | Socket.IOを同じHTTPサーバーに載せる |
| 静的配信 | `dist/client`。devでは存在しないので何も起きない(Viteが配信する) |

必須の環境変数は`PORT`のみ。`DATABASE_URL`(durable persistence)・`ROOM_SNAPSHOT_TTL_MS`は
任意(未設定でも動作する)。キー名は`.env.example`参照。

## 2. ルーム(`src/server/rooms/roomStore.ts`)

ルームコード(4文字、紛らわしい文字を除く英数字)+表示名+reconnect token
(`sessionStorage`、タブごとに分離)のロビーモデル。最小2人・最大5人。
`reconnectTokenHash`はSHA-256 hashのみ保持し、raw tokenは生成した瞬間だけ本人へ返す。

1 socket = 1 room = 1 playerを`socketBindings`で明示的に管理する。reconnectで別socketが
同一playerへ接続し直したら、新socketを正とし、旧socketへ`session:replaced`を送った直後に
切断する。

## 3. ゲームセッション(`src/server/game/gameManager.ts`)

ルームごとに1つの`GameState`(`src/shared/game/state.ts`)をin-memoryで保持する。
host判定・人数制約(2〜5)・lobbyからの開始条件はここで確認し、ルールそのもの
(カード構成・ラッキー挿入・めくり・ラウンド精算)は`src/shared/game/engine.ts`
(とその先の`src/shared/rules/*.ts`)に委譲する。

### ラウンドタイマー(`src/server/game/roundTimer.ts`)

5分のソフトリミットはクライアントの操作に依存せず、サーバー側の定期チェック
(既定1秒間隔)で強制する。`GameState.roundEndsAt`を過ぎた`round_active`のルームを見つけたら、
`finishRoundIfReady(state, rng, now, timedOut=true)`を呼んで強制的にラウンドを終了させ、
結果をbroadcastする。

## 4. Socket.IOイベント

### client → server

| イベント | ペイロード | 備考 |
| --- | --- | --- |
| `room:create` | `{ name }` | |
| `room:join` | `{ code, name }` | |
| `room:reconnect` | `{ code, reconnectToken }` | |
| `room:leave` | — | |
| `game:start` | — | hostのみ。lobby中の2〜5人room |
| `game:luckyPlacement:submit` | `{ position }` | 座席iの持ち主が座席(i+1)%nの手札への挿入位置を選ぶ |
| `game:flip` | — | 自分の手札の次の1枚をめくる(手番順なし) |
| `game:stop` | — | このラウンドはこれ以上めくらない |
| `chat:send` | `{ text }` | 真偽は検証しない |

### server → client

| イベント | 宛先 | 備考 |
| --- | --- | --- |
| `room:joined` | 本人のみ | `SelfIdentity`含むためbroadcast禁止 |
| `room:state` | ルーム全員 | 公開情報のみ |
| `room:error` / `game:error` | 送信元のみ | |
| `session:replaced` | 引き継がれた旧socketのみ | 直後に切断 |
| `game:state` | ルーム全員 | `PublicGameState`。カード種別データは一切含まない |
| `game:handsView` | **本人のsocketへの個別emit限定** | §5参照。`io.to(room).emit`には絶対に載せない |
| `game:round:resolved` | ルーム全員 | ラウンド精算の一時的な表示用サマリ(GameStateには保存されない) |
| `game:ended` | ルーム全員 | 4ラウンド終了時。同率優勝あり |
| `chat:message` | ルーム全員 | |

## 5. 個別視点の手札ビュー(`src/shared/game/handsView.ts`)— 最重要

このゲームの核心は「自分の手札だけが自分に見えない(他の全員には見えている)」という、
通常の「公開state+自分専用の秘密1つ」という単純な分離では表現できない非対称性である。
視点(見る人)によって、どのカードがマスクされるかが毎回異なる。そのため、ゲームの
カード内容に関する情報は、**ルーム全体への1回のbroadcastでは配れない**。

`toHandsView(state, viewerPlayerId)`が、視点ごとに「自分の未オープンカードだけを
`revealed:false`にマスクし、他人の手札と自分が既にめくったカードはそのまま見せる」
ビューを生成する。サーバーは`game:handsView`を**socket単位のループで個別emit**し、
手札に関わる変化(配布・ラッキー挿入・めくり・停止・再接続)が起きるたびに全員へ再送する。

トークン・ポット・タイマー・ラウンド進行などカードの内容を含まない情報は、
`toPublicGameState()`経由で通常通りbroadcastする(カード種別データは一切含まない)。

## 6. 永続化(`src/server/persistence/`)

`DATABASE_URL`が設定されていれば`PostgresRoomRepository`(Neon等、`pg`を直接使用、
ORMなし)、未設定なら`MemoryRoomRepository`を使う。room codeごとに1行、
`{ room, updatedAt }`をJSONB1カラムに丸ごと保存する。`socketId`は永続化しない
(復元時は常に`null`)。reconnectTokenは生のまま保持・保存しない(hashのみ)。

state変更系のイベントは、次状態を計算→durable保存→成功したらbroadcast、という順で
処理する。保存に失敗したらbroadcastせず、`PERSISTENCE_FAILED`エラーを返す。

## 7. チャット

サーバーは文字数(1〜200文字)のみ検証し、内容の真偽は一切判定しない
(ブラフ・駆け引き自体がゲームの一部であるため)。
