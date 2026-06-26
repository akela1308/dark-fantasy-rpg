import * as Phaser from 'phaser/dist/phaser.esm.js';

/**
 * MapUnit — персонаж на карте мира.
 *
 * Paper doll режимы (автодетект по наличию текстур, config.paperdoll !== false):
 *   legMode: 'split'  — нижняя часть разрезана на leg_l / leg_r, ротация в противофазе (боец)
 *   legMode: 'single' — нижняя часть целиком как одна деталь _legs, плавное качание (плащ/герой)
 *
 * Legacy режим (config.paperdoll = false):
 *   skirtWalk: false  — покачивание всего тела ±2.5° (стандарт)
 *   skirtWalk: true   — еле заметный sway + scaleX (юбка/знахарка)
 *
 * Spritesheet режим (config.walkSpriteKey):
 *   idle — обычная статичная картинка, walk — кадровая анимация ходьбы
 */
export class MapUnit {
  constructor(scene, x, y, textureKey, config = {}) {
    this.scene          = scene;
    this.speed          = config.speed         ?? 120;
    this.targetX        = x;
    this.targetY        = y;
    this.moving         = false;
    this._idlePeriod    = config.idlePeriod    ?? 2800;
    this._walkThreshold = config.walkThreshold ?? 10;
    this._skirtWalk     = config.skirtWalk     ?? false;
    this._legMode       = config.legMode       ?? 'split';
    this._walkSpriteKey = config.walkSpriteKey ?? null;
    this._walkAnimKey   = this._walkSpriteKey ? `${this._walkSpriteKey}_walk` : null;
    this._walkFrames    = config.walkFrames    ?? 6;
    this._walkFrameRate = config.walkFrameRate ?? 8;
    this._walkPlaying   = false;
    this._bobTween      = null;
    this._leanTween     = null;
    this._legLTween     = null;
    this._legRTween     = null;
    this._idleTween     = null;
    this._breathTween   = null;

    const h = config.height ?? 72;

    if (this._walkSpriteKey && scene.textures.exists(this._walkSpriteKey)) {
      this._paperdoll = false;
      this._useWalkFrames = true;
      this._idleTextureKey = textureKey;
      this.sprite = scene.add.sprite(x, y, textureKey).setOrigin(0.5, 1).setDepth(y);

      this._baseScale = h / this.sprite.height;
      const walkFrame = scene.textures.get(this._walkSpriteKey).get(0);
      const walkContentH = config.walkFrameContentHeight ?? walkFrame.height;
      this._walkScale = h / walkContentH;
      this.sprite.setScale(this._baseScale);

      if (!scene.anims.exists(this._walkAnimKey)) {
        scene.anims.create({
          key: this._walkAnimKey,
          frames: scene.anims.generateFrameNumbers(this._walkSpriteKey, {
            start: 0,
            end: this._walkFrames - 1,
          }),
          frameRate: this._walkFrameRate,
          repeat: -1,
        });
      }
    } else if (config.paperdoll !== false && scene.textures.exists(textureKey + '_upper')) {
      this._paperdoll = true;
      this._useWalkFrames = false;
      this._setupPaperdoll(x, y, textureKey, h);
    } else {
      this._paperdoll = false;
      this._useWalkFrames = false;
      this.sprite = scene.add.image(x, y, textureKey).setOrigin(0.5, 1).setDepth(y);
      const scale = h / this.sprite.height;
      this.sprite.setScale(scale);
      this._baseScale = scale;
    }

    this.shadow = scene.add.ellipse(x, y + 2, 28, 8, 0x000000, 0.25).setDepth(y - 1);
    this._startIdleAnim();
  }

  _setupPaperdoll(x, y, textureKey, targetH) {
    this._upper = this.scene.add.image(0, 0, textureKey + '_upper').setOrigin(0.5, 1);

    // single: полная нижняя часть как одна деталь (плащ, coat)
    // split:  левая + правая нога раздельно
    if (this._legMode === 'single' && this.scene.textures.exists(textureKey + '_legs')) {
      this._legFull = this.scene.add.image(0, 0, textureKey + '_legs').setOrigin(0.5, 0);
      const s   = targetH / (this._upper.height + this._legFull.height);
      this._baseScale = s;
      const lsH = this._legFull.height * s;
      const OVERLAP = 8;
      this._baseUpperY = -lsH + OVERLAP;
      this._upper.setScale(s).setPosition(0, this._baseUpperY);
      this._legFull.setScale(s).setPosition(0, -lsH);
      this._container = this.scene.add.container(x, y, [this._legFull, this._upper]);
    } else {
      // split mode
      this._legL = this.scene.add.image(0, 0, textureKey + '_leg_l').setOrigin(0.5, 0);
      this._legR = this.scene.add.image(0, 0, textureKey + '_leg_r').setOrigin(0.5, 0);
      const s   = targetH / (this._upper.height + this._legL.height);
      this._baseScale = s;
      const legsH = this._legL.height;
      const Wu    = this._upper.width;
      const Wl    = this._legL.width;
      const Wr    = this._legR.width;
      const lsH   = legsH * s;
      const OVERLAP = 8;
      this._baseUpperY = -lsH + OVERLAP;
      this._upper.setScale(s).setPosition(0, this._baseUpperY);
      this._legL.setScale(s).setPosition(s * (Wl - Wu) / 2, -lsH);
      this._legR.setScale(s).setPosition(s * Wr / 2, -lsH);
      this._container = this.scene.add.container(x, y, [this._legL, this._legR, this._upper]);
    }

    this._container.setDepth(y);

    const container = this._container;
    this.sprite = {
      get x()        { return container.x; },
      set x(v)       { container.x = v; },
      get y()        { return container.y; },
      set y(v)       { container.y = v; },
      setFlipX(flip) { container.scaleX = flip ? -1 : 1; return this; },
      setDepth(d)    { container.setDepth(d); return this; },
      setAngle()     { return this; },
      setScale()     { return this; },
    };
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  moveTo(tx, ty) {
    const dx = tx - this.sprite.x;
    const dy = ty - this.sprite.y;
    if (Math.sqrt(dx * dx + dy * dy) > 15) {
      this.targetX = tx;
      this.targetY = ty;
    }
  }

  stopMove() {
    this.targetX = this.sprite.x;
    this.targetY = this.sprite.y;
    this.moving  = false;
    this._stopWalkAnim();
  }

  update(delta) {
    const dx   = this.targetX - this.sprite.x;
    const dy   = this.targetY - this.sprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 5) {
      if (this.moving) {
        this.moving = false;
        this._stopWalkAnim();
        this._startIdleAnim();
      }
      if (dist < 1) {
        this.sprite.x = this.targetX;
        this.sprite.y = this.targetY;
      }
    } else {
      const step = this.speed * (delta / 1000);
      this.sprite.x += (dx / dist) * step;
      this.sprite.y += (dy / dist) * step;
      this.sprite.setFlipX(dx < 0);

      if (!this.moving && dist > this._walkThreshold) {
        this.moving = true;
        this._stopIdleAnim();
        this._startWalkAnim();
      }
    }

    this.shadow.setPosition(this.sprite.x, this.sprite.y + 2);
    this.sprite.setDepth(this.sprite.y);
    this.shadow.setDepth(this.sprite.y - 1);
  }

  _startWalkAnim() {
    if (this._bobTween || this._walkPlaying) return;

    if (this._useWalkFrames) {
      this.sprite.stop();
      this.sprite.setTexture(this._walkSpriteKey, 0);
      this.sprite.setScale(this._walkScale);
      this.sprite.setAngle(0);
      this.sprite.play(this._walkAnimKey);
      this._walkPlaying = true;
    } else if (this._paperdoll) {
      const baseY = this._baseUpperY;

      // Верхнее тело: лёгкий bob ±2px
      this._bobTween = this.scene.tweens.add({
        targets:  this._upper,
        y:        { from: baseY - 2, to: baseY + 2 },
        duration: 200,
        yoyo: true, repeat: -1,
        ease: 'Sine.easeInOut',
      });

      if (this._legMode === 'single' && this._legFull) {
        // Плащ/пальто: нижняя часть качается целиком ±6° (coat sway)
        this._legLTween = this.scene.tweens.add({
          targets:  this._legFull,
          angle:    { from: -6, to: 6 },
          duration: 500,
          yoyo: true, repeat: -1,
          ease: 'Sine.easeInOut',
        });
      } else if (this._legL && this._legR) {
        // Split: ноги в противофазе ±7°
        this._legLTween = this.scene.tweens.add({
          targets:  this._legL,
          angle:    { from: -7, to: 7 },
          duration: 400,
          yoyo: true, repeat: -1,
          ease: 'Sine.easeInOut',
        });
        this._legRTween = this.scene.tweens.add({
          targets:  this._legR,
          angle:    { from: 7, to: -7 },
          duration: 400,
          yoyo: true, repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }

    } else if (this._skirtWalk) {
      const s = this._baseScale;
      this._bobTween = this.scene.tweens.add({
        targets:  this.sprite,
        scaleX:   { from: s * 0.97, to: s * 1.03 },
        angle:    { from: -1, to: 1 },
        duration: 420,
        yoyo: true, repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } else {
      this._bobTween = this.scene.tweens.add({
        targets:  this.sprite,
        angle:    { from: -2.5, to: 2.5 },
        duration: 200,
        yoyo: true, repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    this._dustTimer = this.scene.time.addEvent({
      delay: 200, loop: true,
      callback: this._spawnDust, callbackScope: this,
    });
  }

  _spawnDust() {
    const side = (Math.floor(this.scene.time.now / 200) % 2 === 0) ? -10 : 10;
    const x = this.sprite.x + side + Phaser.Math.Between(-4, 4);
    const y = this.sprite.y + 4;
    const dust = this.scene.add.ellipse(x, y, 22, 9, 0x9a8060, 0.7).setDepth(this.sprite.y - 2);
    this.scene.tweens.add({
      targets: dust, alpha: 0, scaleX: 2.8, scaleY: 0.2, y: y - 4,
      duration: 380, ease: 'Power2', onComplete: () => dust.destroy(),
    });
  }

  _startIdleAnim() {
    if (this._idleTween) return;
    const s = this._baseScale;

    if (this._paperdoll) {
      this._upper.setScale(s).setPosition(0, this._baseUpperY);
      if (this._legFull) this._legFull.setAngle(0);
      if (this._legL)    this._legL.setAngle(0);
      if (this._legR)    this._legR.setAngle(0);
      this._idleTween = this.scene.tweens.add({
        targets: this._upper,
        scaleY:  { from: s * 0.998, to: s * 1.022 },
        duration: this._idlePeriod,
        yoyo: true, repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } else {
      if (this._useWalkFrames) {
        this.sprite.stop();
        this.sprite.setTexture(this._idleTextureKey);
      }
      this.sprite.setAngle(0);
      this.sprite.setScale(s);
      this._idleTween = this.scene.tweens.add({
        targets: this.sprite,
        scaleY:  { from: s * 0.998, to: s * 1.022 },
        duration: this._idlePeriod,
        yoyo: true, repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  _stopIdleAnim() {
    if (this._idleTween)   { this._idleTween.stop();   this._idleTween   = null; }
    if (this._breathTween) { this._breathTween.stop();  this._breathTween = null; }
    if (this._paperdoll)   { this._upper.setScale(this._baseScale); }
  }

  _stopWalkAnim() {
    if (this._bobTween)  { this._bobTween.stop();   this._bobTween  = null; }
    if (this._leanTween) { this._leanTween.stop();  this._leanTween = null; }
    if (this._legLTween) { this._legLTween.stop();  this._legLTween = null; }
    if (this._legRTween) { this._legRTween.stop();  this._legRTween = null; }
    if (this._dustTimer) { this._dustTimer.remove(); this._dustTimer = null; }
    if (this._walkPlaying) {
      this.sprite.stop();
      this.sprite.setTexture(this._idleTextureKey);
      this._walkPlaying = false;
    }

    if (this._paperdoll) {
      const s = this._baseScale;
      if (this._legFull) this._legFull.setAngle(0);
      if (this._legL)    this._legL.setAngle(0);
      if (this._legR)    this._legR.setAngle(0);
      this._upper.setScale(s).setPosition(0, this._baseUpperY);
    } else {
      this.sprite.setAngle(0);
      this.sprite.setScale(this._baseScale);
    }
  }

  destroy() {
    this._stopWalkAnim();
    this._stopIdleAnim();
    if (this._paperdoll) {
      this._container.destroy();
    } else {
      this.sprite.destroy();
    }
    this.shadow.destroy();
  }
}
