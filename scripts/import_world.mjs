// Переносит локации из world/maps_spec.json ревизии в src/data/maps.json.
// Новые карты получают временную картинку, зоны ходьбы по шаблону и выходы по сторонам.
// Старые карты не теряют ни одного поля: добавляются только недостающие выходы,
// точки появления и поле walk (копия зон из WalkableZones.js, чтобы всё было в одном месте).
// Запуск: node scripts/import_world.mjs [--only id1,id2]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ZONES } from '../src/systems/WalkableZones.js';

const REV = path.join(os.homedir(), 'Documents/Claude/Projects/Mortis/РЕВИЗИЯ_2026-10/');
const SPEC = JSON.parse(fs.readFileSync(REV + 'world/maps_spec.json', 'utf8'));
const MAPS_PATH = new URL('../src/data/maps.json', import.meta.url);
const maps = JSON.parse(fs.readFileSync(MAPS_PATH, 'utf8'));
export const PLACEHOLDER = 'maps/gen/_placeholder.png';
const SCREEN = 0.765;

const onlyArg = process.argv.indexOf('--only');
const ONLY = onlyArg > 0 ? new Set(process.argv[onlyArg + 1].split(',')) : null;

const willExist = id => !!maps[id] || !ONLY || ONLY.has(id);
const spec = Object.fromEntries(SPEC.locations.map(l => [l.id, l]));
const NAMES = Object.fromEntries(SPEC.locations.map(l => [l.id, l.name]));

// Северные выходы закрыты до второй главы (09_МИР 6)
const LOCKED = {
  'tavern_map>north_road': { lockedIfFlag: 'north_closed', lockedText: 'Северный тракт перекрыт.' },
  'kingthrone>winter_forest': { lockedIfFlag: 'north_closed', lockedText: 'Снег ещё не сошёл с перевала.' },
};

const CENTRAL = {
  outdoor: { x: 260, y: 440, w: 1150, h: 360 },
  interior: { x: 300, y: 400, w: 1070, h: 400 },
  cave: { x: 200, y: 470, w: 1270, h: 210 },
};

// Коридор к стороне, зона выхода и точка появления
const SIDES = {
  west:         { corr: { x: 0, y: 540, w: 320, h: 160 },    zone: { x: 0, y: 540, w: 70, h: 160 },    spawn: { x: 160, y: 620 } },
  east:         { corr: { x: 1350, y: 540, w: 322, h: 160 }, zone: { x: 1602, y: 540, w: 70, h: 160 }, spawn: { x: 1510, y: 620 } },
  north:        { corr: { x: 760, y: 200, w: 160, h: 300 },  zone: { x: 760, y: 200, w: 160, h: 60 },  spawn: { x: 840, y: 330 } },
  south:        { corr: { x: 760, y: 760, w: 160, h: 181 },  zone: { x: 760, y: 880, w: 160, h: 61 },  spawn: { x: 840, y: 800 } },
  'north-west': { corr: { x: 0, y: 300, w: 330, h: 170 },    zone: { x: 0, y: 300, w: 70, h: 170 },    spawn: { x: 170, y: 390 } },
  'north-east': { corr: { x: 1340, y: 300, w: 332, h: 170 }, zone: { x: 1602, y: 300, w: 70, h: 170 }, spawn: { x: 1500, y: 390 } },
  'south-west': { corr: { x: 0, y: 760, w: 330, h: 150 },    zone: { x: 0, y: 760, w: 70, h: 150 },    spawn: { x: 170, y: 830 } },
  'south-east': { corr: { x: 1340, y: 760, w: 332, h: 150 }, zone: { x: 1602, y: 760, w: 70, h: 150 }, spawn: { x: 1500, y: 830 } },
};
const DOOR_X = [1150, 520, 1330, 380];

function sideFor(loc, side) {
  if (loc.kind === 'interior') {
    if (side === 'door') return 'south';
    if (side === 'stairs') return 'north';
  }
  if (loc.kind === 'cave') {
    if (side === 'entrance' || side === 'hatch') return 'south';
    if (side === 'down') return 'east';
    if (side === 'up') return 'west';
  }
  return side;
}

const toScreen = (z, text) => ({
  hoverZone: z, text,
  screenX: Math.round((z.x + z.w / 2) * SCREEN),
  screenY: Math.round((z.y + z.h / 2) * SCREEN),
});

function arrow(side) {
  return { west: '←', east: '→', north: '↑', south: '↓', 'north-west': '↖', 'north-east': '↗', 'south-west': '↙', 'south-east': '↘' }[side] || '•';
}

// ── Новая карта целиком ─────────────────────────────────────────────────────
function buildNew(loc) {
  const central = { ...CENTRAL[loc.kind] || CENTRAL.outdoor };
  const walk = [central];
  const exits = [];
  const spawnPoints = {};
  const labels = [];
  let door = 0;
  loc.exits.filter(e => willExist(e.to)).forEach(e => {
    const side = sideFor(loc, e.side);
    let zone, spawn;
    if (SIDES[side]) {
      const s = SIDES[side];
      walk.push({ ...s.corr });
      zone = { ...s.zone };
      spawn = { ...s.spawn };
    } else {
      // дверь, люк, вход: на верхнем краю площадки
      const cx = DOOR_X[door++ % DOOR_X.length];
      zone = { x: cx - 60, y: central.y, w: 120, h: 24 };
      spawn = { x: cx, y: central.y + 90 };
    }
    const lock = LOCKED[`${loc.id}>${e.to}`] || {};
    exits.push({ zone, toMap: e.to, spawnId: `from_${loc.id}`, auto: true, ...lock });
    spawnPoints[`from_${e.to}`] = spawn;
    labels.push(toScreen(zone, `${arrow(side)} ${NAMES[e.to] || e.to}`));
  });
  spawnPoints.default = loc.id === 'south_post' ? { x: 380, y: 620 } : { ...Object.values(spawnPoints)[0] || { x: central.x + central.w / 2, y: central.y + central.h / 2 } };
  const entry = {
    bgKey: `map_${loc.id}`,
    image: loc.asset && fs.existsSync(new URL(`../public/maps/${loc.asset}`, import.meta.url)) ? `maps/${loc.asset}` : PLACEHOLDER,
    name: loc.name,
    region: loc.region,
    level: loc.level,
    kind: loc.kind,
    walkTemplate: loc.walkTemplate,
    spawnPoints,
    exits,
    labels,
    walk,
    tavernEntry: null,
    bandits: false,
    npcs: [],
    props: [],
    encounters: [],
    battleBg: null,
  };
  return entry;
}

// ── Недостающий выход на старой карте ──────────────────────────────────────
function edgeZone(walk, side, taken) {
  const base = side.includes('north') ? 'north' : side.includes('south') ? 'south'
    : side === 'east' ? 'east' : side === 'west' ? 'west' : 'north';
  const key = {
    north: z => z.y, south: z => -(z.y + z.h), east: z => -(z.x + z.w), west: z => z.x,
  }[base];
  const zones = [...walk].sort((a, b) => key(a) - key(b));
  const free = cand => !taken.some(t => cand.x < t.x + t.w && cand.x + cand.w > t.x && cand.y < t.y + t.h && cand.y + cand.h > t.y);
  const tries = [0.5, 0.25, 0.75, 0.1, 0.9];
  for (const z of zones) {
    for (const f of tries) {
      let zone, spawn;
      if (base === 'north' || base === 'south') {
        const w = Math.min(120, z.w);
        const x = Math.round(z.x + (z.w - w) * f);
        zone = base === 'north' ? { x, y: z.y, w, h: 18 } : { x, y: z.y + z.h - 18, w, h: 18 };
        spawn = { x: x + w / 2, y: base === 'north' ? z.y + 70 : z.y + z.h - 70 };
      } else {
        const h = Math.min(120, z.h);
        const y = Math.round(z.y + (z.h - h) * f);
        zone = base === 'east' ? { x: z.x + z.w - 18, y, w: 18, h } : { x: z.x, y, w: 18, h };
        spawn = { x: base === 'east' ? z.x + z.w - 80 : z.x + 80, y: y + h / 2 };
      }
      if (free(zone)) return { zone, spawn };
    }
  }
  return null;
}

function addMissingExits(id, loc, entry) {
  const walk = entry.walk || ZONES[id] || [];
  const present = new Set((entry.exits || []).map(e => e.toMap));
  if (entry.tavernEntry?.toMap) present.add(entry.tavernEntry.toMap);
  const taken = [...(entry.exits || []).map(e => e.zone), entry.tavernEntry?.zone].filter(Boolean);
  loc.exits.forEach(e => {
    if (present.has(e.to) || !willExist(e.to)) return;
    const side = sideFor(loc, e.side);
    const ez = edgeZone(walk, SIDES[side] ? side : 'north', taken);
    if (!ez) { console.warn('нет места для выхода', id, '->', e.to); return; }
    taken.push(ez.zone);
    const lock = LOCKED[`${id}>${e.to}`] || {};
    entry.exits = entry.exits || [];
    entry.exits.push({ zone: ez.zone, toMap: e.to, spawnId: `from_${id}`, auto: true, ...lock });
    entry.spawnPoints[`from_${e.to}`] = entry.spawnPoints[`from_${e.to}`] || ez.spawn;
    entry.labels = entry.labels || [];
    entry.labels.push(toScreen(ez.zone, `${arrow(side)} ${NAMES[e.to] || e.to}`));
    present.add(e.to);
  });
}

// Точка появления `from_X` в карте B должна стоять у выхода B→X
function ensureArrivalSpawns() {
  for (const [id, entry] of Object.entries(maps)) {
    const all = [...(entry.exits || [])];
    if (entry.tavernEntry?.toMap) all.push({ ...entry.tavernEntry });
    all.forEach(ex => {
      const target = maps[ex.toMap];
      if (!target) return;
      if (!target.spawnPoints[ex.spawnId]) {
        // старая запись без такой точки: ставим у выхода обратно
        const back = (target.exits || []).find(e => e.toMap === id) || (target.tavernEntry?.toMap === id ? target.tavernEntry : null);
        if (back) {
          // точка внутрь от зоны выхода, иначе герой сразу уйдёт обратно
          const z = back.zone;
          let x = z.x + z.w / 2, y = z.y + z.h / 2;
          if (z.x < 60) x = z.x + z.w + 70;
          else if (z.x + z.w > 1612) x = z.x - 70;
          else if (z.y < 300) y = z.y + z.h + 70;
          else y = z.y - 70;
          target.spawnPoints[ex.spawnId] = { x: Math.round(x), y: Math.round(y) };
          console.warn('точка появления создана по выходу', ex.toMap, ex.spawnId);
        } else {
          target.spawnPoints[ex.spawnId] = { ...target.spawnPoints.default };
        }
      }
    });
  }
}

let added = 0, patched = 0;
for (const loc of SPEC.locations) {
  if (ONLY && !ONLY.has(loc.id)) continue;
  if (!maps[loc.id]) {
    maps[loc.id] = buildNew(loc);
    added++;
  } else {
    const entry = maps[loc.id];
    if (!entry.walk && ZONES[loc.id]) entry.walk = ZONES[loc.id].map(z => ({ ...z }));
    entry.name = entry.name || loc.name;
    entry.region = entry.region || loc.region;
    entry.level = entry.level ?? loc.level;
    entry.kind = entry.kind || loc.kind;
    if (!entry.walkTemplate) entry.walkTemplate = loc.walkTemplate;
    addMissingExits(loc.id, loc, entry);
    patched++;
  }
}
ensureArrivalSpawns();
fs.writeFileSync(MAPS_PATH, JSON.stringify(maps, null, 2) + '\n');
console.log(`карт добавлено ${added}, старых дополнено ${patched}, всего ${Object.keys(maps).length}`);
