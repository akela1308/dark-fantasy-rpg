/**
 * Единая типографика и палитра окон (этап 6).
 * Один шрифт с засечками, три кегля: заголовок 20, текст 14, подпись 11. Мельче 11 px ничего нет.
 * Палитра эталонов: золото #d4a832, кость #cccccc, приглушённый #888877.
 */
export const FONT = 'Georgia, "Times New Roman", serif';

export const SIZE = { title: 20, body: 14, small: 11 };

export const COLOR = {
  gold: '#d4a832',
  goldHi: '#f0d890',
  bone: '#cccccc',
  text: '#e2dccb',
  muted: '#888877',
  dim: '#6a645a',
  damage: '#e05a4a',
  heal: '#7fcf6a',
  danger: '#e08030',
};

export const HEX = { gold: 0xd4a832, goldHi: 0xf0d890, bg: 0x0d0b0f, bronze: 0x6f5728 };

/**
 * Стиль текста в экранных px. s переводит экранные px в мировые (v / zoom камеры).
 * kind: 'title' | 'body' | 'small'; extra дописывает поля Phaser.
 */
export function textStyle(kind, s = v => v, extra = {}) {
  const base = {
    title: { fontSize: SIZE.title, color: COLOR.gold, letterSpacing: 3 },
    body:  { fontSize: SIZE.body, color: COLOR.text },
    small: { fontSize: SIZE.small, color: COLOR.muted },
  }[kind] || {};
  const st = {
    fontFamily: FONT,
    fontSize: `${Math.round(s(extra.size || base.fontSize))}px`,
    color: base.color,
    stroke: '#000000',
    strokeThickness: s(kind === 'title' ? 2 : 1.5),
    ...(base.letterSpacing ? { letterSpacing: s(base.letterSpacing) } : {}),
    ...extra,
  };
  delete st.size;
  return st;
}

/** Заголовок капителью: прописные буквы. */
export const caps = t => String(t).toLocaleUpperCase('ru-RU');
