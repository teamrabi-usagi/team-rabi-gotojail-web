/**
 * keyごとに非同期タスクをFIFOで直列化する軽量queue。
 *
 * `pg`の`Pool`は`query()`ごとに空いているコネクションを使い回すため、同じroom codeへ
 * ほぼ同時に複数の書き込みが発生すると、DBへの到達順序が呼び出し順と一致する保証が無い。
 * 同じkeyのタスクを呼び出し順どおりに実行させることで、この「完了順序の逆転」を防ぐ。
 */
export class KeyedWriteQueue {
  private readonly queues = new Map<string, Promise<void>>();

  enqueue(key: string, task: () => Promise<void>): Promise<void> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const next = previous.then(task, task);
    this.queues.set(
      key,
      next.catch(() => undefined),
    );
    return next;
  }

  forget(key: string): void {
    this.queues.delete(key);
  }
}
