import type { Card, CardKind } from '../src/shared/types.js';

/** テスト用の短縮記法。`number`省略時はnull(bomb/lucky相当)。 */
export function card(kind: CardKind, number: number | null = null): Card {
  return { kind, number };
}

/** 複数の安全カードを、番号を気にせず(null)素早く作る。 */
export function cards(...kinds: CardKind[]): Card[] {
  return kinds.map((k) => card(k));
}
