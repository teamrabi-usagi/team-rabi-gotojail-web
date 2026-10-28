/**
 * ブラフ用の定型メッセージ送信パネル。
 * サーバーは内容の真偽を一切検証しない(ブラフ/駆け引き用)。
 *
 * 自由入力ではなく、「誰(囚人番号)へ」「あと何枚は捨てられる(安全)と伝えるか」を
 * ボタンだけで組み立てて送る。選択状態はこのモジュール内に保持し、送信後にリセットする。
 * 送信されたメッセージ自体は一覧表示せず、円卓の送信者の真上にふわっと浮かぶトースト
 * (main.tsの`showBluffToast`)として見せる。
 */

export interface ChatCallbacks {
  readonly onSend: (text: string) => void;
}

export interface ChatTarget {
  readonly playerId: string;
  readonly name: string;
  readonly prisonerNumber: number;
}

const MAX_COUNT = 8;

let selectedTargetId: string | null = null;
let selectedCount: number | null = null;

export function composeBluffMessage(target: ChatTarget, count: number): string {
  return `囚人番号${target.prisonerNumber}番!あと${count}枚は捨てられるぞ…!`;
}

export function renderChat(container: HTMLElement, targets: readonly ChatTarget[], callbacks: ChatCallbacks): void {
  container.innerHTML = '';
  container.className = 'panel chat-panel';

  // 選択済みのtargetがもういない(退室等)場合はリセットする。
  if (selectedTargetId !== null && !targets.some((t) => t.playerId === selectedTargetId)) {
    selectedTargetId = null;
  }

  const form = document.createElement('div');
  form.className = 'chat-form';

  const targetLabel = document.createElement('div');
  targetLabel.className = 'chat-form-label';
  targetLabel.textContent = '誰へ伝える?';
  form.appendChild(targetLabel);

  const targetRow = document.createElement('div');
  targetRow.className = 'chat-target-row';
  for (const target of targets) {
    const btn = document.createElement('button');
    btn.className = `chat-chip${selectedTargetId === target.playerId ? ' chat-chip--active' : ''}`;
    btn.textContent = `囚人${target.prisonerNumber}番 ${target.name}`;
    btn.addEventListener('click', () => {
      selectedTargetId = target.playerId;
      renderChat(container, targets, callbacks);
    });
    targetRow.appendChild(btn);
  }
  form.appendChild(targetRow);

  const countLabel = document.createElement('div');
  countLabel.className = 'chat-form-label';
  countLabel.textContent = 'あと何枚は捨てられる(安全)と伝える?';
  form.appendChild(countLabel);

  const countRow = document.createElement('div');
  countRow.className = 'chat-count-row';
  for (let count = 1; count <= MAX_COUNT; count++) {
    const btn = document.createElement('button');
    btn.className = `chat-chip${selectedCount === count ? ' chat-chip--active' : ''}`;
    btn.textContent = String(count);
    btn.addEventListener('click', () => {
      selectedCount = count;
      renderChat(container, targets, callbacks);
    });
    countRow.appendChild(btn);
  }
  form.appendChild(countRow);

  const sendButton = document.createElement('button');
  sendButton.textContent = 'この内容で伝える';
  sendButton.disabled = selectedTargetId === null || selectedCount === null;
  sendButton.addEventListener('click', () => {
    if (selectedTargetId === null || selectedCount === null) {
      return;
    }
    const target = targets.find((t) => t.playerId === selectedTargetId);
    if (target === undefined) {
      return;
    }
    callbacks.onSend(composeBluffMessage(target, selectedCount));
    selectedTargetId = null;
    selectedCount = null;
    renderChat(container, targets, callbacks);
  });
  form.appendChild(sendButton);

  container.appendChild(form);
}
