/**
 * カード種別ごとのプレースホルダー画像(インラインSVG)。
 * 外部アセット無し、`CardKind | 'hidden'` から直接SVG文字列を生成する。
 */

import type { CardKind } from '../../shared/types.js';

export type CardArtKind = CardKind | 'hidden';

const CARD_VIEWBOX = '0 0 60 84';
const CARD_FRAME = '<rect x="2" y="2" width="56" height="80" rx="8" fill="FILL" stroke="STROKE" stroke-width="3"/>';

function frame(fill: string, stroke: string): string {
  return CARD_FRAME.replace('FILL', fill).replace('STROKE', stroke);
}

function hiddenArt(): string {
  return `
    ${frame('#241a13', '#5a4636')}
    <path d="M22 44c0-9 4-16 8-16s8 7 8 16-4 20-8 20-8-11-8-20z" fill="#3a2c20"/>
    <ellipse cx="25" cy="30" rx="3.2" ry="9" fill="#4a3a2c" transform="rotate(-18 25 30)"/>
    <ellipse cx="35" cy="30" rx="3.2" ry="9" fill="#4a3a2c" transform="rotate(18 35 30)"/>
    <line x1="10" y1="12" x2="50" y2="72" stroke="#1b1410" stroke-width="2" opacity="0.5"/>
    <line x1="50" y1="12" x2="10" y2="72" stroke="#1b1410" stroke-width="2" opacity="0.5"/>
  `;
}

function plainArt(): string {
  return `
    ${frame('#e8dcc4', '#6fa96f')}
    <rect x="16" y="20" width="28" height="44" rx="3" fill="none" stroke="#6fa96f" stroke-width="3"/>
    <line x1="16" y1="42" x2="44" y2="42" stroke="#6fa96f" stroke-width="2"/>
    <circle cx="39" cy="42" r="2" fill="#6fa96f"/>
  `;
}

function luckyArt(): string {
  return `
    ${frame('#f4d27a', '#e0a94a')}
    <path d="M30 26 L40 58 L20 58 Z" fill="#e0773a"/>
    <path d="M30 26c-2-6-8-9-14-8 2 6 6 10 14 8z" fill="#6fa96f"/>
    <path d="M30 26c2-6 8-9 14-8-2 6-6 10-14 8z" fill="#6fa96f"/>
    <line x1="24" y1="38" x2="36" y2="38" stroke="#f4d27a" stroke-width="1.5" opacity="0.7"/>
    <line x1="25" y1="46" x2="35" y2="46" stroke="#f4d27a" stroke-width="1.5" opacity="0.7"/>
  `;
}

function bombArt(): string {
  return `
    ${frame('#4a2622', '#c75c4d')}
    <circle cx="28" cy="48" r="16" fill="#15100c" stroke="#c75c4d" stroke-width="2"/>
    <circle cx="28" cy="48" r="5" fill="#2a1f18"/>
    <path d="M34 34 L40 24" stroke="#8a6a4a" stroke-width="3" stroke-linecap="round"/>
    <path d="M40 24 l3-6 M40 24 l6 1 M40 24 l-2-6" stroke="#e0a94a" stroke-width="2" stroke-linecap="round"/>
  `;
}

function artFor(kind: CardArtKind): string {
  switch (kind) {
    case 'hidden':
      return hiddenArt();
    case 'plain':
      return plainArt();
    case 'lucky':
      return luckyArt();
    case 'bomb':
      return bombArt();
  }
}

/** `kind`のプレースホルダーカード画像(SVG)をHTML文字列で返す。 */
export function cardArtSvg(kind: CardArtKind): string {
  return `<svg viewBox="${CARD_VIEWBOX}" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">${artFor(kind)}</svg>`;
}
