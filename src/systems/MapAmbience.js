/**
 * MapAmbience: оживление карты поверх фона: птицы, свет окон, дым из труб, листья/снег/светлячки/пыль,
 * круги на воде, второй медленный слой тумана. Фон и проходимые зоны не трогаются.
 *
 * Настройки по картам и общий множитель quality: src/data/ambience.json.
 * Всё нарисовано процедурно (графика Phaser + твины), без видео и тяжёлых текстур.
 * Глубины: эффекты на земле ниже персонажей, птицы и частицы в воздухе 7000 (ниже HUD 8000+).
 */
import * as Phaser from 'phaser/dist/phaser.esm.js';
import ambienceData from '../data/ambience.json';

const AIR_DEPTH = 7000;
const W = 1672, H = 941;

function makeTextures(scene) {
  const tex = (key, w, h, draw) => {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    draw(g); g.generateTexture(key, w, h); g.destroy();
  };
  // Птицы: два кадра (крылья вверх / вниз), смотрят вправо
  const bird = (key, color, s, up) => tex(key, 24 * s, 14 * s, g => {
    g.fillStyle(color, 1);
    g.fillEllipse(12 * s, 8 * s, 8 * s, 4 * s);                 // тело
    g.fillCircle(16.5 * s, 7 * s, 1.8 * s);                      // голова
    const wy = up ? 1 * s : 13 * s;
    g.fillTriangle(9 * s, 8 * s, 14 * s, 8 * s, 4 * s, wy);       // дальнее крыло
    g.fillTriangle(10 * s, 8 * s, 15 * s, 8 * s, 18 * s, wy);     // ближнее крыло
  });
  bird('amb_crow_a', 0x111111, 1.4, true);  bird('amb_crow_b', 0x111111, 1.4, false);
  bird('amb_small_a', 0x2a2420, 0.8, true); bird('amb_small_b', 0x2a2420, 0.8, false);
  const bat = (key, up) => tex(key, 26, 14, g => {
    g.fillStyle(0x0c0a0c, 1);
    g.fillEllipse(13, 7, 5, 6);
    const wy = up ? 1 : 12;
    g.fillTriangle(12, 7, 2, wy, 6, 9); g.fillTriangle(14, 7, 24, wy, 20, 9);
  });
  bat('amb_bat_a', true); bat('amb_bat_b', false);
  tex('amb_dot', 8, 8, g => { g.fillStyle(0xffffff, 1); g.fillCircle(4, 4, 4); });
  tex('amb_soft', 64, 64, g => {
    for (let r = 32; r > 0; r -= 2) { g.fillStyle(0xffffff, 0.06); g.fillCircle(32, 32, r); }
  });
  tex('amb_leaf', 10, 6, g => { g.fillStyle(0xffffff, 1); g.fillEllipse(5, 3, 9, 4); });
}

export class MapAmbience {
  constructor(scene, mapKey, hero) {
    this.scene = scene;
    this.hero = hero;
    this.q = ambienceData.quality ?? 1;
    const [region, kind] = ambienceData.mapRegions?.[mapKey] ?? [];
    this.cfg = ambienceData.maps?.[mapKey] ?? ambienceData.regionDefaults?.[region]?.[kind];
    if (!this.cfg || this.q <= 0) return;
    makeTextures(scene);
    const c = this.cfg;
    if (c.lights) c.lights.forEach(l => this._light(l));
    if (c.smoke) c.smoke.forEach(s => this._smoke(s));
    if (c.particles) this._particles(c.particles);
    if (c.water) c.water.forEach(w => this._water(w));
    if (c.fog2) this._fog2();
    if (c.birds) this._scheduleBirds(c.birds);
    if (c.birds?.perch?.length) this._scheduleCrowPerch(c.birds);
    if (c.wind !== false) this._wind();
  }

  // ── Ветер: вырезанные деревья и кусты (props с именем tree/oak/pine/bush...) качаются
  //    вокруг основания, слабо и неравномерно, с порывами. Фон карты не трогается.
  _wind() {
    const sc = this.scene;
    const RE = /^prop_.*(tree|oak|pine|birch|willow|bush|spruce|fir|branch|reed)/i;
    const trees = new Set();
    const scan = () => {
      sc.children.list.forEach(o => {
        if (trees.has(o) || o.type !== 'Image' || !RE.test(o.texture?.key || '')) return;
        // ось поворота: середина основания (картинка не сдвигается)
        const nx = o.x + (0.5 - o.originX) * o.displayWidth;
        const ny = o.y + (1 - o.originY) * o.displayHeight;
        o.setOrigin(0.5, 1).setPosition(nx, ny);
        o._windPhase = Math.random() * 6.28;
        o._windAmp = 0.5 + Math.random() * 0.5;   // градусы
        trees.add(o);
      });
    };
    [300, 1500, 4000, 9000].forEach(d => sc.time.delayedCall(d, scan));   // props грузятся лениво
    let gust = 0, gustTarget = 0, t = 0;
    sc.time.addEvent({ delay: 2500, loop: true, callback: () => {
      gustTarget = Math.random() < 0.25 ? 1 + Math.random() : Math.random() * 0.3;   // иногда порыв
    } });
    sc.events.on('update', (_t, d) => {
      if (!trees.size) return;
      t += d / 1000;
      gust += (gustTarget - gust) * Math.min(1, d / 1200);
      trees.forEach(o => {
        if (!o.active) { trees.delete(o); return; }
        o.angle = o._windAmp * (0.6 * Math.sin(t * 1.1 + o._windPhase) + 0.4 * Math.sin(t * 2.3 + o._windPhase * 1.7)) * (0.6 + gust);
      });
    });
  }

  // ── Свет окон и огней: мягкое свечение (ADD), яркость и размер плавают ───
  _light(l) {
    const color = l.color ? Number(l.color) : 0xFFB84A;
    const r = l.r ?? 16;
    const glow = this.scene.add.image(l.x, l.y, 'amb_soft').setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(l.depth ?? 3)
      .setDisplaySize(r * 3.2, r * 2.6).setAlpha(0.35);
    const base = glow.scaleX;
    const flick = () => {
      if (!glow.active) return;
      this.scene.tweens.add({
        targets: glow,
        alpha: Phaser.Math.FloatBetween(0.24, 0.46),
        scaleX: base * Phaser.Math.FloatBetween(0.92, 1.08),
        scaleY: glow.scaleY,
        duration: Phaser.Math.Between(260, 900), ease: 'Sine.easeInOut', onComplete: flick,
      });
    };
    flick();
  }

  // ── Дым из трубы: медленно вверх и по ветру ────────────────────────────
  _smoke(s) {
    const puff = () => {
      const p = this.scene.add.image(s.x + Phaser.Math.Between(-3, 3), s.y, 'amb_soft')
        .setTint(0x9a948a).setAlpha(0).setDepth(s.depth ?? 4).setScale(0.25);
      this.scene.tweens.add({
        targets: p,
        x: p.x + Phaser.Math.Between(30, 70), y: s.y - Phaser.Math.Between(70, 120),
        scale: Phaser.Math.FloatBetween(0.9, 1.4),
        duration: Phaser.Math.Between(4500, 6500), ease: 'Sine.easeOut',
        onUpdate: tw => { p.setAlpha(0.22 * Math.sin(Math.PI * tw.progress)); },
        onComplete: () => p.destroy(),
      });
    };
    this.scene.time.addEvent({ delay: Math.round(700 / this.q), loop: true, callback: puff });
  }

  // ── Листья, снег, светлячки, пыль ─────────────────────────────────────
  _particles(pc) {
    const n = Math.max(1, Math.round((pc.count ?? 10) * this.q));
    for (let i = 0; i < n; i++) {
      this.scene.time.delayedCall(Phaser.Math.Between(0, 6000), () => this._particle(pc.type));
    }
  }

  _particle(type) {
    const sc = this.scene;
    if (!sc.sys?.isActive()) return;
    const again = () => sc.time.delayedCall(Phaser.Math.Between(200, 2500), () => this._particle(type));
    if (type === 'fireflies') {
      const x = Phaser.Math.Between(40, W - 40), y = Phaser.Math.Between(150, H - 60);
      const f = sc.add.image(x, y, 'amb_soft').setTint(0xC8FF7A).setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(AIR_DEPTH).setDisplaySize(10, 10).setAlpha(0);
      sc.tweens.add({
        targets: f, x: x + Phaser.Math.Between(-60, 60), y: y + Phaser.Math.Between(-40, 30),
        duration: Phaser.Math.Between(4000, 7000), ease: 'Sine.easeInOut',
        onUpdate: tw => f.setAlpha(0.85 * Math.sin(Math.PI * tw.progress) * (0.6 + 0.4 * Math.sin(tw.elapsed / 180))),
        onComplete: () => { f.destroy(); again(); },
      });
      return;
    }
    if (type === 'dust') {
      const x = Phaser.Math.Between(100, W - 100), y = Phaser.Math.Between(100, H - 150);
      const d = sc.add.image(x, y, 'amb_dot').setTint(0xE8D2A0).setDepth(AIR_DEPTH).setScale(0.25).setAlpha(0);
      sc.tweens.add({
        targets: d, x: x + Phaser.Math.Between(-30, 30), y: y + Phaser.Math.Between(10, 50),
        duration: Phaser.Math.Between(6000, 9000),
        onUpdate: tw => d.setAlpha(0.35 * Math.sin(Math.PI * tw.progress)),
        onComplete: () => { d.destroy(); again(); },
      });
      return;
    }
    // leaves / snow: падают сверху вниз с покачиванием и ветром
    const snow = type === 'snow';
    const x = Phaser.Math.Between(-50, W - 100);
    const p = sc.add.image(x, -10, snow ? 'amb_dot' : 'amb_leaf')
      .setTint(snow ? 0xF2F4F8 : Phaser.Utils.Array.GetRandom([0x6E4A22, 0x8A5A24, 0x5A4A20, 0x7A3A18]))
      .setDepth(AIR_DEPTH).setScale(snow ? Phaser.Math.FloatBetween(0.3, 0.6) : Phaser.Math.FloatBetween(0.7, 1.1))
      .setAlpha(snow ? 0.8 : 0.85).setAngle(Phaser.Math.Between(0, 360));
    const dur = Phaser.Math.Between(snow ? 9000 : 7000, snow ? 14000 : 11000);
    const drift = Phaser.Math.Between(80, 220), sway = Phaser.Math.Between(15, 35), ph = Math.random() * 6;
    sc.tweens.addCounter({
      from: 0, to: 1, duration: dur,
      onUpdate: tw => {
        const t = tw.getValue();
        p.x = x + drift * t + sway * Math.sin(ph + t * 12);
        p.y = -10 + (H + 20) * t;
        if (!snow) p.angle += 1.5;
        p.setAlpha((snow ? 0.8 : 0.85) * Math.min(1, (1 - t) * 6));
      },
      onComplete: () => { p.destroy(); again(); },
    });
  }

  // ── Круги на воде и пузыри ─────────────────────────────────────────────
  _water(w) {
    const sc = this.scene;
    const ring = () => {
      const x = w.x + Math.random() * w.w, y = w.y + Math.random() * w.h;
      const g = sc.add.ellipse(x, y, 6, 2.5).setStrokeStyle(1, 0xBFD8C0, 0.5).setDepth(2);
      sc.tweens.add({ targets: g, scaleX: 7, scaleY: 7, alpha: 0, duration: 2200, ease: 'Sine.easeOut', onComplete: () => g.destroy() });
      if (Math.random() < 0.35) {
        const b = sc.add.image(x, y, 'amb_dot').setTint(0xC8E0C0).setScale(0.35).setAlpha(0.6).setDepth(2);
        sc.tweens.add({ targets: b, y: y - 4, alpha: 0, scale: 0.6, duration: 700, onComplete: () => b.destroy() });
      }
    };
    sc.time.addEvent({ delay: Math.round(900 / this.q), loop: true, callback: ring });
  }

  // ── Второй медленный слой тумана ───────────────────────────────────────
  _fog2() {
    const sc = this.scene;
    if (!sc.textures.exists('fog2')) return;
    const t = sc.add.tileSprite(W / 2, H * 0.55, W, sc.textures.get('fog2').getSourceImage().height, 'fog2')
      .setAlpha(0.10).setDepth(5);
    sc.events.on('update', (_t, d) => { if (t.active) t.tilePositionX += 0.012 * d; });
    sc.tweens.add({ targets: t, alpha: 0.18, duration: 9000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  // ── Птицы: пролетают по случайной дуге, иногда стайкой ─────────────────
  _scheduleBirds(b) {
    const next = () => this.scene.time.delayedCall(Phaser.Math.Between(b.min ?? 20, b.max ?? 60) * 1000 / this.q, () => {
      if (!this.scene.sys?.isActive()) return;
      const kind = Phaser.Utils.Array.GetRandom(b.kinds || ['crow']);
      const [fmin, fmax] = b.flock || [1, 3];
      const n = kind === 'small' ? Phaser.Math.Between(Math.max(3, fmin), Math.max(3, fmax)) : Phaser.Math.Between(fmin, Math.min(fmax, 2));
      const ltr = Math.random() < 0.5;
      const y0 = Phaser.Math.Between(60, 380), y1 = y0 + Phaser.Math.Between(-120, 120);
      for (let i = 0; i < n; i++) {
        this._fly(kind, ltr, y0 + Phaser.Math.Between(-25, 25), y1 + Phaser.Math.Between(-25, 25), i * Phaser.Math.Between(120, 320));
      }
      next();
    });
    next();
  }

  _fly(kind, ltr, y0, y1, delay, from, to) {
    const sc = this.scene;
    const a = `amb_${kind}_a`, bk = `amb_${kind}_b`;
    const x0 = from?.x ?? (ltr ? -40 : W + 40), x1 = to?.x ?? (ltr ? W + 40 : -40);
    const ys = from?.y ?? y0, ye = to?.y ?? y1;
    const lift = Phaser.Math.Between(-90, 40);   // дуга
    const bird = sc.add.image(x0, ys, a).setDepth(AIR_DEPTH).setFlipX(x1 < x0).setAlpha(0.9);
    const flapMs = kind === 'small' ? 90 : kind === 'bat' ? 70 : 150;
    const flap = sc.time.addEvent({ delay: flapMs, loop: true, callback: () => bird.setTexture(bird.texture.key === a ? bk : a) });
    const dur = Math.abs(x1 - x0) / (kind === 'crow' ? 0.16 : 0.24);
    sc.tweens.addCounter({
      from: 0, to: 1, duration: dur, delay,
      onUpdate: tw => {
        const t = tw.getValue();
        bird.x = x0 + (x1 - x0) * t;
        bird.y = ys + (ye - ys) * t + lift * Math.sin(Math.PI * t) + (kind === 'bat' ? 6 * Math.sin(t * 40) : 0);
      },
      onComplete: () => { flap.remove(); bird.destroy(); to?.onArrive?.(); },
    });
  }

  // ── Ворона садится на забор/крышу и улетает, если подойти близко ───────
  _scheduleCrowPerch(b) {
    const sc = this.scene;
    const go = () => sc.time.delayedCall(Phaser.Math.Between(25, 70) * 1000, () => {
      if (!sc.sys?.isActive()) return;
      const p = Phaser.Utils.Array.GetRandom(b.perch);
      const ltr = Math.random() < 0.5;
      this._fly('crow', ltr, 0, 0, 0, { x: ltr ? -40 : W + 40, y: Phaser.Math.Between(60, 200) },
        { x: p.x, y: p.y, onArrive: () => this._perch(p, ltr, go) });
    });
    go();
  }

  _perch(p, ltr, again) {
    const sc = this.scene;
    const crow = sc.add.image(p.x, p.y, 'amb_crow_a').setDepth(p.y + 1).setFlipX(!ltr).setScale(0.9);
    crow.setTexture('amb_crow_b');
    const start = sc.time.now;
    const peck = sc.time.addEvent({ delay: 1800, loop: true, callback: () => crow.setFlipX(!crow.flipX) });
    const check = sc.time.addEvent({
      delay: 250, loop: true, callback: () => {
        const h = this.hero?.sprite;
        const near = h && Phaser.Math.Distance.Between(h.x, h.y, p.x, p.y) < 160;
        if (!near && sc.time.now - start < 40000) return;
        check.remove(); peck.remove(); crow.destroy();
        const away = Math.random() < 0.5;
        this._fly('crow', away, 0, 0, 0, { x: p.x, y: p.y }, { x: away ? W + 40 : -40, y: Phaser.Math.Between(40, 160), onArrive: again });
      },
    });
  }
}
