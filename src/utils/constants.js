// Размеры игры
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

// Цвета
export const COLORS = {
  BG:            0x0A0A0F,
  PLAYER_BORDER: 0x4A90D9,
  ENEMY_BORDER:  0xCC2222,
  ACTIVE_BORDER: 0x00FF88,
  GRID_CELL:     0x1A1A2E,
  GRID_BORDER:   0x2A2A4E,
  TEXT_MAIN:     '#E8E8E8',
  TEXT_GOLD:     '#C9A84C',
  TEXT_RED:      '#CC4444',
  TEXT_GREEN:    '#44CC88',
  HP_BAR_BG:     0x330000,
  HP_BAR_FILL:   0xCC2222,
  HP_BAR_PLAYER: 0x2266CC,
};

// Сетка боя
export const GRID = {
  COLS: 3,
  ROWS: 2,
  CELL_W: 140,
  CELL_H: 110,
  PLAYER_START_X: 120,
  ENEMY_START_X:  740,
  START_Y: 240,
  GAP_X: 10,
  GAP_Y: 10,
};

// Фазы боя
export const PHASE = {
  PLAYER_INPUT: 'player_input',
  AI_THINKING:  'ai_thinking',
  RESOLVING:    'resolving',
  END:          'end',
};

// XP
export const XP = {
  WIN_HERO:      100,
  WIN_COMPANION: 60,
  THRESHOLD:     100,
};

// Задержка ИИ (мс)
export const AI_DELAY = 900;
