import * as Phaser from 'phaser/dist/phaser.esm.js';
import { checkRequires } from './DialogueConditions.js';
import battlesData from '../data/battles.json';
import HEIGHTS from '../data/heights.json';
import { getBattleAnimConfig } from './BattleAnimations.js';
import { loadSheetOnce, whenTextures } from '../utils/loadOnce.js';

/**
 * Встречи на карте по характеру (14_БЕСТИАРИЙ, разделы 2 и 8). На месте встречи стоит первое существо боя
 * (первый кадр боевой стойки, рост по heights.json), под ногами кольцо цвета поведения (красный нападает сам,
 * жёлтый осторожный, серый мирный), имя при наведении. Существо без арта и западня остаются кругом.
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
    const sleeping = e.behaviour === 'lair' && e.triggerFlag && !this.ws.flag(e.triggerFlag);
    const label = s.add.text(e.x, e.y - r - 14, `${e.name || e.id}${sleeping ? ': логово, клик разбудит' : ''}`, {
      fontFamily: 'serif', fontSize: '15px', color: '#E8DEC8', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(e.y + 1).setAlpha(0);
    marker.setInteractive({ useHandCursor: true });
    marker.on('pointerover', () => label.setAlpha(1));
    marker.on('pointerout', () => label.setAlpha(0));
    marker.on('pointerdown', () => this._onClick(item));
    s.tweens.add({ targets: marker, alpha: { from: 0.35, to: 0.75 }, duration: 1400, yoyo: true, repeat: -1 });
    const item = { cfg: e, marker, label, state: 'idle', t: 0, wp: 0, triggered: false };
    if (e.behaviour !== 'trap') this._figure(item, color);
    return item;
  }

  /** Существо встречи: кадр стойки первого врага боя. Пока лист грузится, виден круг. */
  _figure(item, color) {
    const s = this.scene;
    const e = item.cfg;
    const enemy = battlesData.find(b => b.id === e.battleId)?.enemies?.[0];
    if (!enemy) return;
    const key = enemy.spriteKey ?? enemy.id;
    const idle = getBattleAnimConfig(key)?.anims?.idle;
    if (!idle) return;
    if (loadSheetOnce(s, idle.key, idle.file, { frameWidth: idle.frameWidth, frameHeight: idle.frameHeight })) s.load.start();
    whenTextures(s, [idle.key], () => {
      if (this._done(item) || !item.marker.active) return;
      const M = HEIGHTS.map;
      const hM = HEIGHTS.units[key] ?? HEIGHTS.battle.default;
      const px = M.heroPx * (s._charScale || 1) * hM / M.heroM;
      const spr = s.add.sprite(item.marker.x, item.marker.y, idle.key, 0)
        .setOrigin(idle.originX, idle.originY).setScale(px / idle.bodyHeight).setFlipX(true).setDepth(item.marker.y);
      // Круг становится кольцом под ногами, клик и наведение остаются на нём и на фигуре
      const w = Math.max(40, px * 0.55);
      s.tweens.killTweensOf(item.marker);
      item.marker.setVisible(false);
      const ring = s.add.ellipse(item.marker.x, item.marker.y, w, w * 0.3).setStrokeStyle(2, color, 0.8).setDepth(item.marker.y - 1);
      s.tweens.add({ targets: ring, alpha: { from: 0.4, to: 0.9 }, duration: 1400, yoyo: true, repeat: -1 });
      spr.setInteractive({ useHandCursor: true, pixelPerfect: false });
      spr.on('pointerover', () => item.label.setAlpha(1));
      spr.on('pointerout', () => item.label.setAlpha(0));
      spr.on('pointerdown', () => this._onClick(item));
      item.label.setY(item.marker.y - px - 8);
      item.figure = spr;
      item.ring = ring;
      item.figH = px;
      // Дыхание
      s.tweens.add({ targets: spr, scaleY: spr.scaleY * 1.015, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      // Маркер уничтожен (бой начался): фигура и кольцо уходят вместе с ним
      item.marker.once('destroy', () => { spr.destroy(); ring.destroy(); });
    });
  }

  /** Встреча пройдена (бой выигран): существо уходит с карты. */
  finish(id) {
    this.list.filter(it => it.cfg.id === id).forEach(it => {
      it.state = 'done';
      [it.marker, it.label, it.figure, it.ring].forEach(o => o && this.scene.tweens.add({ targets: o, alpha: 0, duration: 400, onComplete: () => o.destroy() }));
    });
  }

  _done(item) { return item.state === 'done' || this.ws.flag(`enc_${item.cfg.id}_done`); }

  _onClick(item) {
    if (this._done(item) || this.scene._dialogue?.active) return;
    if (item.cfg.behaviour === 'loner') this.hooks.talk?.(item.cfg);
    if (item.cfg.behaviour === 'lair') this._wake(item);
  }

  /** Логово просыпается от клика или если подойти вплотную; дальше нападает, как только отряд рядом. */
  _wake(item) {
    const f = item.cfg.triggerFlag;
    if (!f || this.ws.flag(f)) return;
    this.ws.setFlag(f, true);
    this.hooks.toast?.(`${item.cfg.name || 'Логово'}: просыпается`);
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
          // спит, пока не сделано действие-триггер (клик по логову или шаг вплотную)
          if (e.triggerFlag && !this.ws.flag(e.triggerFlag) && dist < 60) this._wake(item);
          if ((!e.triggerFlag || this.ws.flag(e.triggerFlag)) && dist < radius * 2) this._fight(item);
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
    item.label.setPosition(item.marker.x, item.marker.y - (item.figH ? item.figH + 8 : 36));
    if (item.figure) {
      item.figure.setFlipX(b.x < a.x ? false : true).setPosition(item.marker.x, item.marker.y).setDepth(item.marker.y);
      item.ring.setPosition(item.marker.x, item.marker.y).setDepth(item.marker.y - 1);
    }
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
