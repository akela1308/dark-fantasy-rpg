/**
 * WalkableZones - проходимые зоны для каждой карты.
 * Координаты - мировые пиксели (карта 1672×941).
 * Конвертация из экранных: world = screen / 0.765
 */

export const ZONES = {

  // ─── Map 1: руины/кладбище - диагональная дорога ───────────────────────────
  // Зоны опущены вниз (+40 по y) и расширены снизу (h ~148) относительно предыдущей версии
  map1: [
    { x: 0,    y: 612, w: 320,  h: 148 },
    { x: 278,  y: 578, w: 314,  h: 143 },
    { x: 545,  y: 544, w: 308,  h: 138 },
    { x: 803,  y: 508, w: 330,  h: 133 },
    { x: 1075, y: 472, w: 355,  h: 128 },
    { x: 1370, y: 432, w: 302,  h: 126 },
  ],

  // ─── Tavern Map: дорога диагональная + X у таверны ─────────────────────────
  //  Верхняя ветка X → дверь таверны → Tavern Inside
  //  Нижняя ветка X → нижний-правый угол → Forest1
  tavern_map: [
    // Левая Y-развилка: верхняя ветка (→ road_boloto) + нижняя ветка (→ road_boloto)
    { x: 0,    y: 295, w: 230,  h: 110 },   // блок 1: верхняя левая ветка (road_boloto выход)
    { x: 0,    y: 390, w: 230,  h: 130 },   // блок 2: нижняя левая ветка (road_boloto выход)
    // Центральная диагональная дорога
    { x: 190,  y: 430, w: 210,  h: 200 },   // блок 3: обрезан до x:400 (кв. 400,400 - запрет)
    { x: 440,  y: 515, w: 370,  h: 210 },   // блок 4
    { x: 770,  y: 520, w: 230,  h: 240 },   // блок 5а: x=770-1000, y=520-760
    { x: 1000, y: 520, w: 150,  h: 180 },   // блок 5б: x=1000-1150, только до y=700
    // Нижний-левый угол: вход с map1, соединяется с блоком 4
    { x: 0,    y: 600, w: 480,  h: 341 },   // блок 6: нижний-левый угол (спавн из map1)
    // Правая развилка: блок 7 разбит - запрет x:1200-1500 выше y:500
    { x: 1500, y: 400, w: 172,  h: 168 },   // блок 7а: правая часть у двери (x>1500, не выше y=400)
    { x: 1380, y: 500, w: 120,  h: 68  },   // блок 7б: соединение снизу (y>500, вне запрета)
    { x: 1100, y: 530, w: 100,  h: 170 },   // блок 8а: x=1100-1200, только до y=700
    { x: 1200, y: 530, w: 472,  h: 411 },   // блок 8б: x=1200-1672, y=530-941 → Forest1
  ],

  // ─── Tavern Inside: коридоры между стенами, столиками и барной стойкой ─────
  tavern_inside: [
    { x: 618,  y: 800, w: 325,  h: 141 },   // вход/выход (дверь, нижний центр)
    { x: 148,  y: 742, w: 505,  h: 100 },   // нижний-левый проход
    { x: 148,  y: 380, w: 240,  h: 378 },   // левый вертикальный коридор
    { x: 148,  y: 358, w: 500,  h: 118 },   // верхний горизонтальный проход
    { x: 600,  y: 372, w: 228,  h: 268 },   // центр-левый коридор (h обрезан до y=640, дварфы недоступны)
    { x: 793,  y: 372, w: 252,  h: 268 },   // центральный коридор  (h обрезан до y=640, дварфы недоступны)
    { x: 1000, y: 390, w: 360,  h: 322 },   // правый-центр (у бара)
    { x: 1310, y: 430, w: 188,  h: 278 },   // правый коридор
  ],

  // ─── Forest1: главная дорога + Y-развилка ──────────────────────────────────
  forest1: [
    { x: 0,    y: 490, w: 450,  h: 162 },
    { x: 400,  y: 455, w: 430,  h: 162 },
    { x: 770,  y: 368, w: 415,  h: 318 },
    { x: 1042, y: 350, w: 212,  h: 142 },
    { x: 1065, y: 192, w: 607,  h: 258 },   // верхняя ветка → Mountains
    { x: 1042, y: 490, w: 212,  h: 136 },
    { x: 1065, y: 570, w: 607,  h: 228 },   // нижняя ветка → Elf Swamp
  ],

  // ─── Mountains Map: дуговой путь через двор крепости ──────────────────────
  mountains_map: [
    { x: 0,    y: 490, w: 375,  h: 228 },
    { x: 320,  y: 490, w: 560,  h: 228 },
    { x: 845,  y: 395, w: 465,  h: 395 },
    { x: 742,  y: 245, w: 128,  h: 218 },   // обрезан до x=870; здание справа (x>880) недоступно
    { x: 325,  y: 228, w: 485,  h: 222 },
    { x: 85,   y: 262, w: 315,  h: 318 },
  ],

  // ─── King Throne: дворфийский тронный зал - открытый мощёный пол ──────────
  // Ходим по центральному полу. Исключены: трон-помост (центр-верх),
  // машинерия слева-внизу и вагонетки справа-внизу.
  kingthrone: [
    { x: 640, y: 400, w: 360, h: 110 },   // подход к ступеням трона (x640-1000)
    { x: 470, y: 480, w: 700, h: 180 },   // средний пол (x470-1170, y480-660)
    { x: 430, y: 640, w: 810, h: 215 },   // передний пол (x430-1240, y640-855)
  ],

  // ─── Road to Village: лесной перекрёсток, дорога слева-снизу → вправо ─────
  // Зоны щедрые (гарантируют проход); точная подгонка к дороге - визуально.
  road_to_village: [
    { x: 0,    y: 560, w: 660,  h: 175 },   // левый вход (из леса)
    { x: 560,  y: 470, w: 560,  h: 195 },   // центральная дуга дороги
    { x: 1000, y: 410, w: 672,  h: 195 },   // правый выход (к вратам), указатель
  ],

  // ─── Gate: двор перед городскими вратами, ворота справа ──────────────────
  gate: [
    { x: 40,  y: 470, w: 1330, h: 320 },    // открытый мощёный двор
  ],

  // ─── Village: деревенская площадь между домами, часовня, колодец ─────────
  village: [
    { x: 100, y: 510, w: 1480, h: 350 },    // передняя площадь / дорога
    { x: 480, y: 420, w: 640,  h: 120 },    // проход к часовне
  ],

  // ─── Road Boloto: болотная дорога с развилкой ────────────────────────────
  road_boloto: [
    { x: 0,    y: 190, w: 450,  h: 261 },  // блок 1: опущен на пол высоты + уже (было y:0 h:321)
    { x: 300,  y: 310, w: 400,  h: 220 },  // блок 2: уже (было h:280)
    { x: 580,  y: 430, w: 400,  h: 220 },  // блок 3: уже
    { x: 880,  y: 490, w: 500,  h: 220 },  // блок 4: уже
    { x: 1250, y: 750, w: 422,  h: 161 },  // блок 5: уже (было h:221)
  ],

  // ─── Elf Boloto: X-форма - два пересекающихся пути ────────────────────────
  elf_boloto: [
    { x: 0,    y: 292, w: 445,  h: 195 },
    { x: 392,  y: 350, w: 445,  h: 195 },
    { x: 783,  y: 408, w: 445,  h: 200 },
    { x: 1172, y: 460, w: 500,  h: 205 },
    { x: 0,    y: 488, w: 445,  h: 188 },
    { x: 392,  y: 432, w: 445,  h: 188 },
    { x: 783,  y: 368, w: 445,  h: 188 },
    { x: 1172, y: 302, w: 500,  h: 195 },
  ],

  // ─── Elf Boloto 1: поселение на болотных настилах ────────────────────────
  elf_boloto1: [
    { x: 0,    y: 470, w: 250, h: 145 },  // левый настил и лестница у дома
    { x: 170,  y: 325, w: 350, h: 105 },  // левая верхняя каменная дорога
    { x: 430,  y: 370, w: 260, h: 110 },  // подход к центральному перекрестку
    { x: 610,  y: 430, w: 270, h: 120 },  // центральный перекресток
    { x: 760,  y: 520, w: 255, h: 100 },  // средняя дорога вправо, без водной полосы
    { x: 1015, y: 585, w: 385, h: 105 },  // нижняя правая каменная дорога
    { x: 1300, y: 690, w: 260, h: 125 },  // нижняя правая дорога перед выходом
    { x: 1410, y: 750, w: 262, h: 125 },  // правый нижний выход по дороге
    { x: 850,  y: 245, w: 190, h: 220 },  // лестница к верхнему дому
    { x: 1360, y: 400, w: 190, h: 155 },  // лестница и площадка правого дома
    { x: 1470, y: 500, w: 202, h: 120 },  // спуск от правого дома к дороге
  ],
};

// Сетка ходьбы: клетка 24 мировых px, карта 1672×941 → 70×40 клеток.
// В данных строка на ряд: '1' можно стоять, '0' нельзя (src/data/walkgrid.json, правится редактором ?dev=1).
export const CELL = 24;
export const MAP_W = 1672, MAP_H = 941;
export const COLS = Math.ceil(MAP_W / CELL), ROWS = Math.ceil(MAP_H / CELL);

/** Прямоугольники зон → сетка: клетка проходима, если её центр внутри какой-нибудь зоны. */
export function rasterizeZones(zones) {
  const cells = new Uint8Array(COLS * ROWS);
  for (let r = 0; r < ROWS; r++) {
    const cy = r * CELL + CELL / 2;
    for (let c = 0; c < COLS; c++) {
      const cx = c * CELL + CELL / 2;
      if (zones.some(z => cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h)) cells[r * COLS + c] = 1;
    }
  }
  return cells;
}

export function decodeGrid(g) {
  const cells = new Uint8Array(COLS * ROWS);
  (g?.rows || []).forEach((row, r) => {
    if (r >= ROWS) return;
    for (let c = 0; c < Math.min(COLS, row.length); c++) cells[r * COLS + c] = row[c] === '1' ? 1 : 0;
  });
  return cells;
}

export function encodeGrid(cells) {
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    let s = '';
    for (let c = 0; c < COLS; c++) s += cells[r * COLS + c] ? '1' : '0';
    rows.push(s);
  }
  return { cell: CELL, cols: COLS, rows };
}

export class WalkableZones {
  // grid (src/data/walkgrid.json) главнее всего: её размечают вручную. Без неё сетка строится из
  // прямоугольников: zones из maps.json (поле walk) важнее встроенных ZONES.
  constructor(mapKey, zones = null, grid = null) {
    this.zones = (Array.isArray(zones) && zones.length ? zones : ZONES[mapKey]) || [];
    this.fromGrid = !!grid?.rows?.length;
    this.setCells(this.fromGrid ? decodeGrid(grid) : rasterizeZones(this.zones));
  }

  /** Новая маска (редактор): пересчитываем связные области. */
  setCells(cells) {
    this.cells = cells;
    this._labelComponents();
  }

  // Связные области (8 соседей, без срезания углов): по ним видно, достижима ли клетка
  _labelComponents() {
    const comp = new Int32Array(COLS * ROWS).fill(-1);
    let n = 0;
    const stack = [];
    for (let i = 0; i < this.cells.length; i++) {
      if (!this.cells[i] || comp[i] >= 0) continue;
      comp[i] = n; stack.push(i);
      while (stack.length) {
        const k = stack.pop();
        this.neighbors(k, j => { if (comp[j] < 0) { comp[j] = n; stack.push(j); } });
      }
      n++;
    }
    this.comp = comp;
  }

  cellOf(x, y) {
    const c = Math.floor(x / CELL), r = Math.floor(y / CELL);
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return -1;
    return r * COLS + c;
  }

  center(i) { return { x: (i % COLS) * CELL + CELL / 2, y: Math.floor(i / COLS) * CELL + CELL / 2 }; }

  open(i) { return i >= 0 && this.cells[i] === 1; }

  /** Проходимые соседи клетки: 4 прямых и 4 диагональных, если обе прямые рядом с диагональю открыты. */
  neighbors(i, cb) {
    const c = i % COLS, r = (i - c) / COLS;
    const ok = (cc, rr) => cc >= 0 && rr >= 0 && cc < COLS && rr < ROWS && this.cells[rr * COLS + cc] === 1;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (ok(c + dc, r + dr)) cb((r + dr) * COLS + c + dc, 1);
    for (const [dc, dr] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      if (ok(c + dc, r + dr) && ok(c + dc, r) && ok(c, r + dr)) cb((r + dr) * COLS + c + dc, Math.SQRT2);
    }
  }

  isWalkable(x, y) { return this.open(this.cellOf(x, y)); }

  /** Ближайшая проходимая клетка (в области comp, если задана). null, если таких нет. */
  nearestCell(x, y, comp = null) {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < this.cells.length; i++) {
      if (!this.cells[i] || (comp !== null && this.comp[i] !== comp)) continue;
      const p = this.center(i);
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  clamp(x, y) {
    if (this.isWalkable(x, y)) return { x, y };
    const i = this.nearestCell(x, y);
    return i >= 0 ? this.center(i) : { x, y };
  }

  /**
   * Прямая от точки до точки идёт только по проходимым клеткам (шаг четверть клетки).
   * radius: запас в стороны от линии, чтобы путь не шёл впритирку к углу стены.
   */
  lineClear(x0, y0, x1, y1, radius = 0) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(d / (CELL / 4)));
    const nx = d ? -(y1 - y0) / d * radius : 0, ny = d ? (x1 - x0) / d * radius : 0;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      if (!this.isWalkable(x, y)) return false;
      if (radius && (!this.isWalkable(x + nx, y + ny) || !this.isWalkable(x - nx, y - ny))) return false;
    }
    return true;
  }

  drawDebug(scene) {
    const g = scene.add.graphics().setDepth(100).setAlpha(0.4);
    g.fillStyle(0x00FF44, 0.25);
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i]) { const p = this.center(i); g.fillRect(p.x - CELL / 2, p.y - CELL / 2, CELL, CELL); }
    return g;
  }
}
