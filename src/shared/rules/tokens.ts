/**
 * 刑期トークンの①(残り刑期)⇄②(自由/捨てた)ゾーン間の移動ロジック。
 * 典拠: docs/RULE_SPEC.md §刑期トークン。
 */

export interface PlayerTokens {
  readonly zone1: number;
  readonly zone2: number;
}

export function createInitialTokens(startingZone1: number): PlayerTokens {
  return { zone1: startingZone1, zone2: 0 };
}

/**
 * ①→②へamount移動する(安全フリップ変換・ラウンド勝者ボーナスで使う)。
 * ①が負にならないよう防御的に0でfloorする(このルートでは理論上発生しないはずの安全策)。
 */
export function moveZone1ToZone2(tokens: PlayerTokens, amount: number): PlayerTokens {
  const clampedZone1 = Math.max(tokens.zone1, 0);
  const applied = Math.min(amount, clampedZone1);
  return { zone1: clampedZone1 - applied, zone2: tokens.zone2 + applied };
}

/** 座(アンティ)の受け取り: ①へamountを加算する(ペナルティ、上限なし)。 */
export function receiveAntePayout(tokens: PlayerTokens, amount: number): PlayerTokens {
  if (amount <= 0) {
    return tokens;
  }
  return { zone1: tokens.zone1 + amount, zone2: tokens.zone2 };
}

/** 座(アンティ)の支払い: ①からamountを中央の座へ出す。 */
export function payAnte(tokens: PlayerTokens, amount: number): PlayerTokens {
  const clampedZone1 = Math.max(tokens.zone1, 0);
  const applied = Math.min(amount, clampedZone1);
  return { zone1: clampedZone1 - applied, zone2: tokens.zone2 };
}
