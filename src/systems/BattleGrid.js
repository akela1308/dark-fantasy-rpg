import { GRID } from '../utils/constants.js';
import eventBus from '../utils/eventBus.js';

/**
 * BattleGrid — логика позиционирования на поле 2×3.
 * Хранит матрицу для каждой стороны (player/enemy).
 */
export class BattleGrid {
  constructor() {
    // grid[side][row][col] = Unit | null
    this.grid = {
      player: this._makeEmpty(),
      enemy:  this._makeEmpty(),
    };
  }

  _makeEmpty() {
    return Array.from({ length: GRID.ROWS }, () =>
      Array(GRID.COLS).fill(null)
    );
  }

  // Разместить юнита на его стартовую позицию
  place(unit) {
    const side = unit.type === 'player' ? 'player' : 'enemy';
    const { row, col } = unit.position;
    this.grid[side][row][col] = unit;
  }

  placeAll(units) {
    units.forEach(u => this.place(u));
  }

  // Переместить юнита
  moveUnit(unit, newRow, newCol) {
    const side = unit.type === 'player' ? 'player' : 'enemy';
    const { row, col } = unit.position;
    this.grid[side][row][col] = null;
    this.grid[side][newRow][newCol] = unit;
    unit.position = { row: newRow, col: newCol };
    eventBus.emit('grid_updated');
  }

  // Убрать мёртвого юнита с поля
  remove(unit) {
    const side = unit.type === 'player' ? 'player' : 'enemy';
    const { row, col } = unit.position;
    this.grid[side][row][col] = null;
    eventBus.emit('grid_updated');
  }

  // Проверить валидность перемещения (на своей стороне, клетка пуста)
  isValidMove(unit, newRow, newCol) {
    const side = unit.type === 'player' ? 'player' : 'enemy';
    if (newRow < 0 || newRow >= GRID.ROWS) return false;
    if (newCol < 0 || newCol >= GRID.COLS) return false;
    return this.grid[side][newRow][newCol] === null;
  }

  // Получить список живых юнитов в переднем ряду указанной стороны
  getFrontRow(side) {
    return this.grid[side][0].filter(u => u && u.isAlive);
  }

  // Доступна ли цель для ближней атаки
  canMeleeAttack(attacker, defender) {
    if (attacker.ranged || attacker.ignoreRows) return true;
    // Ближний бой: может бить задний ряд только если передний пуст
    if (defender.position.row === 1) {
      const defSide = defender.type === 'player' ? 'player' : 'enemy';
      const frontAlive = this.getFrontRow(defSide).filter(u => u.isAlive);
      return frontAlive.length === 0;
    }
    return true;
  }

  // Пиксельная позиция клетки для рендера
  static getCellPixelPos(side, row, col) {
    const baseX = side === 'player' ? GRID.PLAYER_START_X : GRID.ENEMY_START_X;
    return {
      x: baseX + col * (GRID.CELL_W + GRID.GAP_X),
      y: GRID.START_Y + row * (GRID.CELL_H + GRID.GAP_Y),
    };
  }
}
