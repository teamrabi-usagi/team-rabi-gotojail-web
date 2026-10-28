/**
 * ラウンド終了時の①②精算をまとめる純粋関数。
 * 典拠: docs/RULE_SPEC.md §ラウンドの終了と処理。
 *
 * 順序: 1. 安全フリップ変換(①→②) 2. ラウンド勝者ボーナス(①→②、同立可)
 *       3. 座(アンティ)精算(bust順に①へ加算)
 */

import { moveZone1ToZone2, receiveAntePayout, type PlayerTokens } from './tokens.js';
import { settleBustPayouts } from './ante.js';
import { remainingSafeCount, type PlayerRoundProgress } from './flip.js';

export const ROUND_WINNER_BONUS = 2;

export interface RoundPlayerInput {
  readonly playerId: string;
  readonly tokens: PlayerTokens;
  readonly progress: PlayerRoundProgress;
}

export interface RoundPlayerResult {
  readonly playerId: string;
  readonly tokens: PlayerTokens;
  readonly safeFlipConversion: number;
  readonly roundWinnerBonusApplied: boolean;
  readonly antePayout: number;
}

export interface ResolveRoundResult {
  readonly players: readonly RoundPlayerResult[];
  readonly roundWinnerIds: readonly string[];
  readonly potRemaining: number;
}

export function resolveRound(
  inputs: readonly RoundPlayerInput[],
  potAtRoundStart: number,
  bustOrder: readonly string[],
): ResolveRoundResult {
  // 1. 安全フリップ変換(① -> ②)。bustした人も、bustするまでに実際に捨てた分はそのまま適用する。
  const afterConversion = inputs.map((input) => ({
    playerId: input.playerId,
    tokens: moveZone1ToZone2(input.tokens, input.progress.weightedSafeCount),
    progress: input.progress,
    safeFlipConversion: input.progress.weightedSafeCount,
  }));

  // 2. ラウンド勝者判定: bustしていない生存者の中で、残っている安全カードが最少の人(同立可)。
  const survivors = afterConversion.filter((p) => !p.progress.busted);
  let roundWinnerIds: readonly string[] = [];
  if (survivors.length > 0) {
    const remainingCounts = survivors.map((p) => remainingSafeCount(p.progress));
    const minRemaining = Math.min(...remainingCounts);
    roundWinnerIds = survivors.filter((p) => remainingSafeCount(p.progress) === minRemaining).map((p) => p.playerId);
  }
  const winnerSet = new Set(roundWinnerIds);

  const afterBonus = afterConversion.map((p) => {
    const isWinner = winnerSet.has(p.playerId);
    return {
      ...p,
      tokens: isWinner ? moveZone1ToZone2(p.tokens, ROUND_WINNER_BONUS) : p.tokens,
      roundWinnerBonusApplied: isWinner,
    };
  });

  // 3. 座(アンティ)精算: bust順に切り上げ半分を①へ加算。
  const { payouts, potRemaining } = settleBustPayouts(potAtRoundStart, bustOrder);
  const payoutByPlayer = new Map<string, number>(payouts.map((p) => [p.playerId, p.amount]));

  const players: RoundPlayerResult[] = afterBonus.map((p) => {
    const antePayout = payoutByPlayer.get(p.playerId) ?? 0;
    return {
      playerId: p.playerId,
      tokens: antePayout > 0 ? receiveAntePayout(p.tokens, antePayout) : p.tokens,
      safeFlipConversion: p.safeFlipConversion,
      roundWinnerBonusApplied: p.roundWinnerBonusApplied,
      antePayout,
    };
  });

  return { players, roundWinnerIds, potRemaining };
}
