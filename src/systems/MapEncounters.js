import * as Phaser from 'phaser/dist/phaser.esm.js';
import { checkRequires } from './DialogueConditions.js';

/**
 * Встречи на карте по характеру (14_БЕСТИАРИЙ, разделы 2 и 8). Пока без арта: круг-заглушка,
 * цвет по поведению (красный нападает сам, жёлтый осторожный, серый мирный) и имя при наведении.
 *
 * maps.json → encounters: [{
 *   id, battleId, name, behaviour: 'pack'|'lair'|'patrol'|'trap'|'loner'|'coward',
 *   x, y, radius,                 // pack/coward/loner: радиус агрессии или разговора
 *   triggerFlag,                  // lair: флаг-триггер (осмотр, огни)
 *   waypoints: [{x,y}], period,   // patrol: маршрут и время круга в мс
 *   spotters: { companion, trait }// trap: кто распознаёт западню
 *   dialogue, dialogueStart,      // loner: разговор перед боем
 *   showIf: {...}                 // встреча есть только при условии
 * }]
 * Пройденная встреча помечается флагом enc_<id>_done.
 */
const COLORS = { pack: 0xCC3322, patrol: 0xCC3322, coward: 0xCC3322, lair: 0xD4A832, trap: 0xD4A832, loner: 0x8A8A8A };
const DEFAULT_RADIUS = { pack: 120, coward: 140, patrol: 90, lair: 110, trap: 45, loner: 90 };

export class MapEncounters {
  /**
   * hooks: { battle(enc, { ambush }), talk(enc), toast(text) }
   */
  constructor(scene, encounters, ws, hooks) {
    this.scene = scene;
    this.ws = ws;
    this.hooks = hooks;
    this.list = (encounters || [])
      .filter(e => !ws.flag(`enc_${e.id}_done`))
      .filter(e => checkRequires(e.showIf, ws).ok)
      .map(e => this._spawn(e));
    this._cooldown = 1500;   // после входа на карту никто не нападает сразу
  }

  _spawn(e) {
    const s = this.scene;
    const color = COLORS[e.behaviour] ?? 0xCC3322;
    const r = e.behaviour === 'trap' ? 14 : 22;
    const marker = s.add.circle(e.x, e.y, r, color, 0.55).setStrokeStyle(2, 0x000000, 0.8).setDepth(e.y);
    const label = s.add.text(e.x, e.y - r - 14, e.name || e.id, {
      fontFamily: 'serif', fontSize: '15px', color: '#E8DEC8', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(e.y + 1).setAlpha(0);
    marker.setInteractive({ useHandCursor: true });
    marker.on('pointerover', () => label.setAlpha(1));
    marker.on('pointerout', () => label.setAlpha(0));
    marker.on('pointerdown', () => this._onClick(item));
    s.tweens.add({ targets: marker, alpha: { from: 0.35, to: 0.75 }, duration: 1400, yoyo: true, repeat: -1 });
    const item = { cfg: e, marker, label, state: 'idle', t: 0, wp: 0, triggered: false };
    return item;
  }

  _done(item) { return item.state === 'done' || this.ws.flag(`enc_${item.cfg.id}_done`); }

  _onClick(item) {
    if (this._done(item) || this.scene._dialogue?.active) return;
    if (item.cfg.behaviour === 'loner') this.hooks.talk?.(item.cfg);
  }

  update(delta, hero) {
    if (this._cooldown > 0) { this._cooldown -= delta; return; }
    if (this.scene._transitioning || this.scene._dialogue?.active) return;
    for (const item of this.list) {
      if (this._done(item) || item.triggered) continue;
      const e = item.cfg;
      const radius = e.radius ?? DEFAULT_RADIUS[e.behaviour] ?? 100;

      if (e.behaviour === 'patrol' && e.waypoints?.length) this._patrol(item, delta);
      const mx = item.marker.x, my = item.marker.y;
      const dist = Phaser.Math.Distance.Between(hero.x, hero.y, mx, my);

      switch (e.behaviour) {
        case 'pack':
        case 'coward':
        case 'patrol':
          if (dist < radius) this._fight(item);
          break;
        case 'lair':
          // спит, пока не сделано действие-триггер
          if (e.triggerFlag && this.ws.flag(e.triggerFlag) && dist < radius * 2) this._fight(item);
          break;
        case 'trap':
          if (dist < radius) this._trap(item);
          break;
        case 'loner':
          // не нападает сам; разговор по клику
          break;
        default:
          if (dist < radius) this._fight(item);
      }
    }
  }

  _patrol(item, delta) {
    const e = item.cfg;
    const pts = [{ x: e.x, y: e.y }, ...e.waypoints];
    const period = e.period || 12000;
    item.t = (item.t + delta) % period;
    const seg = (item.t / period) * pts.length;
    const i = Math.floor(seg);
    const a = pts[i % pts.length];
    const b = pts[(i + 1) % pts.length];
    const k = seg - i;
    item.marker.setPosition(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k).setDepth(item.marker.y);
    item.label.setPosition(item.marker.x, item.marker.y - 36);
  }

  _trap(item) {
    const sp = item.cfg.spotters || {};
    const party = this.ws.party();
    const spotted = (sp.companion && [].concat(sp.companion).some(c => party.includes(c)))
      || (sp.trait && this.ws.hasTrait(sp.trait));
    if (spotted) {
      item.state = 'done';
      this.ws.setFlag(`enc_${item.cfg.id}_done`, true);
      item.marker.destroy(); item.label.destroy();
      this.hooks.toast?.('Западня. Её заметили вовремя, вы обходите стороной.');
      return;
    }
    this._fight(item, { ambush: true });
  }

  _fight(item, opts = {}) {
    item.triggered = true;
    this.hooks.battle?.(item.cfg, opts);
  }
}
