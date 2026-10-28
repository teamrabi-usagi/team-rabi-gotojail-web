/**
 * メインプールの構成・シャッフル・配布・安全側ソートの純粋ロジック。
 * 典拠: docs/RULE_SPEC.md §カード構成。
 *
 * DB / Socket.IO / DOM に依存しない。乱数は必ず引数で受け取り、
 * この層で Math.random() を暗黙に使わない（テストで再現可能にするため）。
 */

import type { CardKind, PlayerCount, Rng } from '../types.js';

/** 人数に関わらず固定で非公開(除去)にする枚数。 */
export const HIDDEN_COUNT = 6;

/** メインプールから1人に配る枚数(ラッキーカードは別枠で+1枚、合計8枚になる)。 */
export const MAIN_HAND_SIZE = 7;

interface PoolComposition {
  readonly total: number;
  readonly plainSafe: number;
  readonly bomb: number;
}

/** 人数別のメインプール構成。total = plainSafe + bomb = 7*n + HIDDEN_COUNT。 */
export const MAIN_POOL_BY_PLAYER_COUNT: Readonly<Record<PlayerCount, PoolComposition>> = {
  2: { total: 20, plainSafe: 12, bomb: 8 },
  3: { total: 27, plainSafe: 16, bomb: 11 },
  4: { total: 34, plainSafe: 20, bomb: 14 },
  5: { total: 41, plainSafe: 25, bomb: 16 },
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

function buildRawPool(n: PlayerCount): CardKind[] {
  const comp = MAIN_POOL_BY_PLAYER_COUNT[n];
  const pool: CardKind[] = [];
  for (let i = 0; i < comp.plainSafe; i++) pool.push('plain');
  for (let i = 0; i < comp.bomb; i++) pool.push('bomb');
  return pool;
}

export interface DealResult {
  /** 人数分の配列、各要素はまだソート・ラッキー挿入前の7枚。 */
  readonly hands: readonly (readonly CardKind[])[];
  /** 非公開の除去カード(HIDDEN_COUNT枚)。クライアントへは絶対に送らない。 */
  readonly hidden: readonly CardKind[];
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

  const hands: CardKind[][] = [];
  for (let i = 0; i < n; i++) {
    hands.push(remaining.slice(i * MAIN_HAND_SIZE, (i + 1) * MAIN_HAND_SIZE));
  }

  return { hands, hidden };
}

/**
 * 安全側(plain/lucky)を先に、爆弾を後ろに集める。各側の中の相対順序は
 * (シャッフル済みの)入力の順序をそのまま保持する(安定分割)。
 */
export function sortSafeFirst(sevenCards: readonly CardKind[]): CardKind[] {
  const safe = sevenCards.filter((k) => k !== 'bomb');
  const bombs = sevenCards.filter((k) => k === 'bomb');
  return [...safe, ...bombs];
}

export function isAllBombs(sevenCards: readonly CardKind[]): boolean {
  return sevenCards.length > 0 && sevenCards.every((k) => k === 'bomb');
}
