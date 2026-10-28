/**
 * メインプールの構成・シャッフル・配布・安全側ソートの純粋ロジック。
 * 典拠: docs/RULE_SPEC.md §カード構成。
 *
 * DB / Socket.IO / DOM に依存しない。乱数は必ず引数で受け取り、
 * この層で Math.random() を暗黙に使わない（テストで再現可能にするため）。
 */

import type { Card, PlayerCount, Rng } from '../types.js';

/** 人数に関わらず固定で非公開(除去)にする枚数。 */
export const HIDDEN_COUNT = 6;

/** メインプールから1人に配る枚数(ラッキーカードは別枠で+1枚、合計8枚になる)。 */
export const MAIN_HAND_SIZE = 7;

/** 安全カードに付く番号の範囲(1〜5)。 */
export const SAFE_NUMBER_MIN = 1;
export const SAFE_NUMBER_MAX = 5;

interface PoolComposition {
  readonly total: number;
  readonly plainSafe: number;
  /** 看守マーク付きの安全カード枚数。2人プレイでは0(看守は3人以上でのみ使用)、それ以外は常に5(番号1〜5が1枚ずつ)。 */
  readonly guardSafe: number;
  readonly bomb: number;
}

/** 人数別のメインプール構成。total = plainSafe + guardSafe + bomb = 7*n + HIDDEN_COUNT。 */
export const MAIN_POOL_BY_PLAYER_COUNT: Readonly<Record<PlayerCount, PoolComposition>> = {
  2: { total: 20, plainSafe: 12, guardSafe: 0, bomb: 8 },
  3: { total: 27, plainSafe: 11, guardSafe: 5, bomb: 11 },
  4: { total: 34, plainSafe: 15, guardSafe: 5, bomb: 14 },
  5: { total: 41, plainSafe: 20, guardSafe: 5, bomb: 16 },
};

export function mainPoolSizeFor(n: PlayerCount): number {
  return MAIN_POOL_BY_PLAYER_COUNT[n].total;
}

/** Fisher-Yatesシャッフル。入力を破壊しない。 */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];

  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const ai = a[i] as T;
    const aj = a[j] as T;
    a[i] = aj;
    a[j] = ai;
  }

  return a;
}

/** count枚に1〜5の番号を、できるだけ均等に割り振る(余りは若い番号から1枚ずつ多く持たせる)。 */
export function distributeSafeNumbers(count: number): number[] {
  const range = SAFE_NUMBER_MAX - SAFE_NUMBER_MIN + 1;
  const base = Math.floor(count / range);
  const remainder = count % range;
  const numbers: number[] = [];
  for (let n = SAFE_NUMBER_MIN; n <= SAFE_NUMBER_MAX; n++) {
    const qty = base + (n - SAFE_NUMBER_MIN < remainder ? 1 : 0);
    for (let i = 0; i < qty; i++) numbers.push(n);
  }
  return numbers;
}

function buildRawPool(n: PlayerCount): Card[] {
  const comp = MAIN_POOL_BY_PLAYER_COUNT[n];
  const pool: Card[] = [];
  for (const num of distributeSafeNumbers(comp.plainSafe)) pool.push({ kind: 'plain', number: num });
  // guardSafeは0か5のどちらかなので、5の場合は番号1〜5が1枚ずつになる。
  if (comp.guardSafe > 0) {
    for (let num = SAFE_NUMBER_MIN; num <= SAFE_NUMBER_MAX; num++) pool.push({ kind: 'guard', number: num });
  }
  for (let i = 0; i < comp.bomb; i++) pool.push({ kind: 'bomb', number: null });
  return pool;
}

export interface DealResult {
  /** 人数分の配列、各要素はまだソート・ラッキー挿入前の7枚。 */
  readonly hands: readonly (readonly Card[])[];
  /** 非公開の除去カード(HIDDEN_COUNT枚)。クライアントへは絶対に送らない。 */
  readonly hidden: readonly Card[];
}

/** メインプールをシャッフルし、HIDDEN_COUNT枚を除去してから人数分に配り切る。 */
export function dealMainPool(n: PlayerCount, rng: Rng): DealResult {
  const pool = buildRawPool(n);
  const expectedTotal = mainPoolSizeFor(n);
  if (pool.length !== expectedTotal) {
    throw new Error(`dealMainPool(): pool size ${pool.length} !== expected ${expectedTotal}`);
  }

  const shuffled = shuffle(pool, rng);
  const hidden = shuffled.slice(0, HIDDEN_COUNT);
  const remaining = shuffled.slice(HIDDEN_COUNT);

  const expectedRemaining = MAIN_HAND_SIZE * n;
  if (remaining.length !== expectedRemaining) {
    throw new Error(`dealMainPool(): remaining ${remaining.length} !== expected ${expectedRemaining}`);
  }

  const hands: Card[][] = [];
  for (let i = 0; i < n; i++) {
    hands.push(remaining.slice(i * MAIN_HAND_SIZE, (i + 1) * MAIN_HAND_SIZE));
  }

  return { hands, hidden };
}

/**
 * 安全側(plain/guard)を先に、爆弾を後ろに集める。安全側はさらに番号の大きい順に並べる
 * (爆弾から最も遠い=5、最も近い=1)。番号が同じカード同士の相対順序は、
 * (シャッフル済みの)入力の順序をそのまま保持する(安定ソート)。
 */
export function sortSafeFirst(sevenCards: readonly Card[]): Card[] {
  const safe = sevenCards.filter((c) => c.kind !== 'bomb');
  const bombs = sevenCards.filter((c) => c.kind === 'bomb');
  const sortedSafe = [...safe].sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
  return [...sortedSafe, ...bombs];
}

export function isAllBombs(sevenCards: readonly Card[]): boolean {
  return sevenCards.length > 0 && sevenCards.every((c) => c.kind === 'bomb');
}
