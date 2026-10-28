/**
 * GameStateを直接書き換える状態遷移関数群。クライアント入力はここで検証する。
 * 典拠: docs/RULE_SPEC.md。
 *
 * Phase 2の範囲: createGameState / setupRound / submitLuckyPlacement。
 * flipCard / stop / tickRoundEnd / resolveRound / startNextRound / finishGame はPhase 3/4で追加する。
 */

import type { Card, CardKind, NeighborDirection, PlayerCount, Rng } from '../types.js';
import { isPlayerCount } from '../types.js';
import { dealMainPool, sortSafeFirst } from '../rules/deck.js';
import { forcedPosition, insertLuckyCard, isAllowedPosition, luckyRecipientSeat } from '../rules/luckyPlacement.js';
import { createInitialTokens, payAnte } from '../rules/tokens.js';
import { anteAmountPerPlayer } from '../rules/ante.js';
import { canFlip, createPlayerRoundProgress, flipNext, stopFlipping, type PlayerRoundProgress } from '../rules/flip.js';
import { resolveRound, type RoundPlayerInput } from '../rules/roundResolution.js';
import { buildGuardEventDeck, drawGuardEventCard } from '../rules/guardEventDeck.js';
import {
  ROUND_TIMER_SECONDS,
  STARTING_ZONE1,
  TOTAL_ROUNDS,
  type GameState,
  type PendingGuardEvent,
  type PlayerGameState,
  type RoundResolvedSummary,
} from './state.js';

interface Failure {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
}

export type EngineResult = { readonly ok: true } | Failure;

function fail(code: string, message: string): Failure {
  return { ok: false, code, message };
}

function requirePlayerCount(n: number): PlayerCount {
  if (!isPlayerCount(n)) {
    throw new Error(`requirePlayerCount(): ${n} is not a valid player count (2-5)`);
  }
  return n;
}

function getPlayer(state: GameState, playerId: string): PlayerGameState | undefined {
  return state.players[playerId];
}

/** 座席seatから見た`direction`隣の座席。本プロジェクトの既存の慣習(luckyRecipientSeat)に合わせ、
 * seat+1を「左隣」、seat-1を「右隣」とする。 */
function neighborSeat(seat: number, n: number, direction: NeighborDirection): number {
  return direction === 'left' ? (seat + 1) % n : (seat - 1 + n) % n;
}

/** 新しいGameStateを作り、1ラウンド目のround_setupまで進める。 */
export function createGameState(playerIds: readonly string[], rng: Rng): GameState {
  const n = requirePlayerCount(playerIds.length);

  const players: Record<string, PlayerGameState> = {};
  playerIds.forEach((id, seat) => {
    players[id] = {
      playerId: id,
      seat,
      tokens: createInitialTokens(STARTING_ZONE1),
      mainSeven: [],
      luckyPlacementPosition: null,
      hand: null,
      progress: null,
    };
  });

  const state: GameState = {
    playerOrder: [...playerIds],
    players,
    roundNo: 0,
    phase: 'round_setup',
    pot: 0,
    bustOrder: [],
    roundTimerSeconds: ROUND_TIMER_SECONDS,
    roundEndsAt: null,
    guardEventDeck: buildGuardEventDeck(n, rng),
    pendingGuardEvent: null,
    winnerIds: null,
  };

  setupRound(state, rng);
  return state;
}

/** 座(アンティ)の収集・配布・手札のソートを行い、round_setupへ入る。 */
export function setupRound(state: GameState, rng: Rng): void {
  const n = requirePlayerCount(state.playerOrder.length);

  state.roundNo += 1;
  state.phase = 'round_setup';
  state.bustOrder = [];
  state.roundEndsAt = null;
  state.pendingGuardEvent = null;

  // 座(アンティ)の収集: 全員①から2個ずつ中央の座へ。持ち越し分に上乗せする。
  // ①が2未満で全額を払えない場合でも、実際に払えた分だけを座に加える(トークン保存則を守るため、
  // anteTotalFor(n)を無条件に加算しない)。
  let actualAnteCollected = 0;
  for (const playerId of state.playerOrder) {
    const player = state.players[playerId] as PlayerGameState;
    const zone1Before = player.tokens.zone1;
    player.tokens = payAnte(player.tokens, anteAmountPerPlayer());
    actualAnteCollected += zone1Before - player.tokens.zone1;
  }
  state.pot += actualAnteCollected;

  // 配布: メインプールをシャッフルして配り、各自の7枚を安全側ソートする。
  const { hands } = dealMainPool(n, rng);
  state.playerOrder.forEach((playerId, seat) => {
    const player = state.players[playerId] as PlayerGameState;
    const dealt = hands[seat] as readonly Card[];
    player.mainSeven = sortSafeFirst(dealt);
    player.luckyPlacementPosition = null;
    player.hand = null;
    player.progress = null;
  });
}

/**
 * 座席iの持ち主(ownerPlayerId)が、自分のラッキーカードを座席(i+1)%nの手札に挿入する位置を決める。
 * 全員が配置を終えると自動的にround_activeへ遷移し、`now`を起点にタイマーを開始する。
 */
export function submitLuckyPlacement(state: GameState, ownerPlayerId: string, position: number, now: number): EngineResult {
  if (state.phase !== 'round_setup') {
    return fail('INVALID_PHASE', 'ラッキーカードを配置できるフェーズではありません');
  }

  const owner = getPlayer(state, ownerPlayerId);
  if (owner === undefined) {
    return fail('NOT_IN_GAME', 'このゲームの参加者ではありません');
  }

  const n = requirePlayerCount(state.playerOrder.length);
  const recipientSeat = luckyRecipientSeat(owner.seat, n);
  const recipientPlayerId = state.playerOrder[recipientSeat] as string;
  const recipient = state.players[recipientPlayerId] as PlayerGameState;

  if (recipient.hand !== null) {
    return fail('ALREADY_PLACED', 'すでに配置済みです');
  }

  if (!isAllowedPosition(recipient.mainSeven, position)) {
    const forced = forcedPosition(recipient.mainSeven);
    return forced !== null
      ? fail('FORCED_POSITION_REQUIRED', '手札が全て爆弾のため、先頭に配置する必要があります')
      : fail('INVALID_POSITION', '不正な配置位置です');
  }

  recipient.luckyPlacementPosition = position;
  recipient.hand = insertLuckyCard(recipient.mainSeven, position);
  recipient.progress = createPlayerRoundProgress(recipient.hand);

  if (state.playerOrder.every((id) => (state.players[id] as PlayerGameState).hand !== null)) {
    state.phase = 'round_active';
    state.roundEndsAt = now + state.roundTimerSeconds * 1000;
  }

  return { ok: true };
}

/** まだラッキーカードの配置(=自分が担当する相手の挿入)を終えていないownerのplayerId一覧。 */
export function pendingLuckyPlacementOwners(state: GameState): readonly string[] {
  if (state.phase !== 'round_setup') {
    return [];
  }
  const n = requirePlayerCount(state.playerOrder.length);
  return state.playerOrder.filter((ownerId) => {
    const owner = state.players[ownerId] as PlayerGameState;
    const recipientSeat = luckyRecipientSeat(owner.seat, n);
    const recipientId = state.playerOrder[recipientSeat] as string;
    return (state.players[recipientId] as PlayerGameState).hand === null;
  });
}

/** そのプレイヤーが、このラウンドでもう何もすることがない状態(脱落/停止/手札を使い切った)か。 */
function isPlayerDoneThisRound(player: PlayerGameState): boolean {
  const progress = player.progress;
  if (progress === null) {
    return false;
  }
  return progress.busted || progress.stopped || progress.flippedCount >= progress.hand.length;
}

function allPlayersDone(state: GameState): boolean {
  return state.playerOrder.every((id) => isPlayerDoneThisRound(state.players[id] as PlayerGameState));
}

/**
 * ラウンド終了条件(timedOut、または全員done)を満たしていれば、①②精算・座精算・
 * 次ラウンドのセットアップ(または終局判定)までを1回でまとめて行う。満たしていなければnull。
 */
export function finishRoundIfReady(state: GameState, rng: Rng, now: number, timedOut: boolean): RoundResolvedSummary | null {
  if (state.phase !== 'round_active') {
    return null;
  }
  // 看守イベントの回答待ちの間はラウンドを終了させない(対象者の回答でタイマーが再開してから判定する)。
  if (state.pendingGuardEvent !== null) {
    return null;
  }
  if (!timedOut && !allPlayersDone(state)) {
    return null;
  }

  const potBeforeSettlement = state.pot;
  const bustOrder = [...state.bustOrder];

  const inputs: RoundPlayerInput[] = state.playerOrder.map((id) => {
    const p = state.players[id] as PlayerGameState;
    return { playerId: id, tokens: p.tokens, progress: p.progress as PlayerRoundProgress };
  });

  const result = resolveRound(inputs, potBeforeSettlement, bustOrder);

  const summaryPlayers = result.players.map((pr) => {
    const player = state.players[pr.playerId] as PlayerGameState;
    // setupRound/finishGame(下)がこの後player.hand/progressを次ラウンド用に上書きするため、
    // 一斉公開演出に使う「このラウンドの最終的な8枚」はここで(上書き前に)捕捉しておく。
    const finalHand = player.hand ?? [];
    const flippedCountAtEnd = player.progress?.flippedCount ?? 0;
    const busted = player.progress?.busted ?? false;
    player.tokens = pr.tokens;
    return {
      playerId: pr.playerId,
      zone1: pr.tokens.zone1,
      zone2: pr.tokens.zone2,
      safeFlipConversion: pr.safeFlipConversion,
      roundWinnerBonusApplied: pr.roundWinnerBonusApplied,
      antePayout: pr.antePayout,
      finalHand,
      flippedCountAtEnd,
      busted,
    };
  });

  state.pot = result.potRemaining;

  const remainingMs = state.roundEndsAt !== null ? Math.max(0, state.roundEndsAt - now) : 0;
  const timerCarrySeconds = timedOut ? ROUND_TIMER_SECONDS : Math.ceil(remainingMs / 1000);
  state.roundTimerSeconds = timerCarrySeconds;
  state.roundEndsAt = null;

  const summary: RoundResolvedSummary = {
    roundNo: state.roundNo,
    players: summaryPlayers,
    roundWinnerIds: result.roundWinnerIds,
    potBeforeSettlement,
    bustOrder,
    potCarryOver: result.potRemaining,
    timerCarrySeconds,
    timedOut,
  };

  state.phase = 'round_end';

  if (state.roundNo >= TOTAL_ROUNDS) {
    finishGame(state);
  } else {
    setupRound(state, rng);
  }

  return summary;
}

/** 4ラウンドを終えた時点で、①が最も少ないプレイヤー(同率優勝あり)を勝者にする。 */
export function finishGame(state: GameState): void {
  const zone1Values = state.playerOrder.map((id) => (state.players[id] as PlayerGameState).tokens.zone1);
  const minZone1 = Math.min(...zone1Values);
  state.winnerIds = state.playerOrder.filter((id) => (state.players[id] as PlayerGameState).tokens.zone1 === minZone1);
  state.phase = 'game_end';
}

export interface TriggeredGuardEvent {
  readonly drawerPlayerId: string;
  readonly targetPlayerId: string;
  readonly targetPrisonerNumber: number;
  readonly neighborPlayerId: string;
  readonly direction: NeighborDirection;
}

export type FlipCardResult =
  | {
      readonly ok: true;
      readonly outcome: 'safe' | 'bomb';
      readonly flippedKind: CardKind;
      readonly guardEvent: TriggeredGuardEvent | null;
      readonly roundSummary: RoundResolvedSummary | null;
    }
  | { readonly ok: false; readonly code: string; readonly message: string };

/** 看守マーク付きカードがめくられた瞬間の処理: イベントを1枚引き、進行を一時停止する。 */
function triggerGuardEvent(state: GameState, drawerPlayerId: string, rng: Rng, now: number): TriggeredGuardEvent {
  const n = requirePlayerCount(state.playerOrder.length);
  const { card, deck } = drawGuardEventCard(state.guardEventDeck, rng);
  state.guardEventDeck = deck;

  const targetSeat = card.prisonerNumber - 1;
  const targetPlayerId = state.playerOrder[targetSeat] as string;
  const neighborPlayerId = state.playerOrder[neighborSeat(targetSeat, n, card.direction)] as string;

  const pausedRemainingMs = state.roundEndsAt !== null ? Math.max(0, state.roundEndsAt - now) : 0;
  state.roundEndsAt = null;

  const pending: PendingGuardEvent = {
    drawerPlayerId,
    targetPlayerId,
    targetPrisonerNumber: card.prisonerNumber,
    neighborPlayerId,
    direction: card.direction,
    pausedRemainingMs,
  };
  state.pendingGuardEvent = pending;

  return pending;
}

/** 自分の手札の次の1枚をめくる。手番の順序はない(各自好きなタイミングで呼べる)。 */
export function flipCard(state: GameState, playerId: string, rng: Rng, now: number): FlipCardResult {
  if (state.phase !== 'round_active') {
    return fail('INVALID_PHASE', 'めくれるフェーズではありません');
  }
  if (state.pendingGuardEvent !== null) {
    return fail('GUARD_EVENT_PENDING', '看守イベントの回答待ちです');
  }

  const player = getPlayer(state, playerId);
  if (player === undefined || player.hand === null || player.progress === null) {
    return fail('NOT_IN_GAME', 'このゲームの参加者ではありません');
  }
  if (!canFlip(player.progress)) {
    return fail('CANNOT_FLIP', 'めくれません(脱落済み・停止済み、または手札を使い切っています)');
  }

  const flipResult = flipNext(player.progress);
  player.progress = flipResult.progress;

  if (flipResult.outcome === 'bomb') {
    state.bustOrder.push(playerId);
  }

  let guardEvent: TriggeredGuardEvent | null = null;
  if (flipResult.outcome === 'safe' && flipResult.flippedCard.kind === 'guard') {
    guardEvent = triggerGuardEvent(state, playerId, rng, now);
  }

  const roundSummary = finishRoundIfReady(state, rng, now, false);

  return { ok: true, outcome: flipResult.outcome, flippedKind: flipResult.flippedCard.kind, guardEvent, roundSummary };
}

export type StopResult =
  | { readonly ok: true; readonly roundSummary: RoundResolvedSummary | null }
  | { readonly ok: false; readonly code: string; readonly message: string };

/** 自分の意思で、このラウンドはこれ以上めくらないと宣言する。 */
export function stop(state: GameState, playerId: string, rng: Rng, now: number): StopResult {
  if (state.phase !== 'round_active') {
    return fail('INVALID_PHASE', 'やめを宣言できるフェーズではありません');
  }
  if (state.pendingGuardEvent !== null) {
    return fail('GUARD_EVENT_PENDING', '看守イベントの回答待ちです');
  }

  const player = getPlayer(state, playerId);
  if (player === undefined || player.progress === null) {
    return fail('NOT_IN_GAME', 'このゲームの参加者ではありません');
  }
  if (!canFlip(player.progress)) {
    return fail('CANNOT_STOP', 'すでに脱落・停止済み、または手札を使い切っています');
  }

  player.progress = stopFlipping(player.progress);
  const roundSummary = finishRoundIfReady(state, rng, now, false);

  return { ok: true, roundSummary };
}

export interface ResolvedGuardEvent {
  readonly targetPlayerId: string;
  readonly neighborPlayerId: string;
  readonly direction: NeighborDirection;
  readonly count: number;
}

export type RespondToGuardEventResult =
  | { readonly ok: true; readonly resolved: ResolvedGuardEvent; readonly roundSummary: RoundResolvedSummary | null }
  | { readonly ok: false; readonly code: string; readonly message: string };

/** 看守イベントの対象者が、指定された隣人について「あと何枚捨てられるか」を回答する。回答した瞬間にタイマーが再開する。 */
export function respondToGuardEvent(state: GameState, playerId: string, count: number, rng: Rng, now: number): RespondToGuardEventResult {
  if (state.phase !== 'round_active') {
    return fail('INVALID_PHASE', '看守イベントに回答できるフェーズではありません');
  }
  const pending = state.pendingGuardEvent;
  if (pending === null) {
    return fail('NO_PENDING_EVENT', '回答すべき看守イベントがありません');
  }
  if (pending.targetPlayerId !== playerId) {
    return fail('NOT_YOUR_EVENT', 'このイベントの回答者はあなたではありません');
  }
  if (!Number.isInteger(count) || count < 0 || count > 8) {
    return fail('INVALID_COUNT', '不正な回答です');
  }

  state.pendingGuardEvent = null;
  state.roundEndsAt = now + pending.pausedRemainingMs;

  const roundSummary = finishRoundIfReady(state, rng, now, false);

  return {
    ok: true,
    resolved: { targetPlayerId: pending.targetPlayerId, neighborPlayerId: pending.neighborPlayerId, direction: pending.direction, count },
    roundSummary,
  };
}
