/**
 * MapUnit — персонаж на карте мира.
 * Если загружены текстуры {key}_upper/_leg_l/_leg_r — активируется paper doll режим:
 * ноги качаются при ходьбе (angle ±18°, противофаза), breathing на torso в idle.
 * Иначе — legacy режим: единый спрайт с покачиванием тела.
 */
export class MapUnit {
  constructor(scene, x, y, textureKey, config = {}) {
    this.scene            = scene;
    this.speed            = config.speed       ?? 120;
    this.targetX          = x;
    this.targetY          = y;
    this.moving           = false;
    this._idlePeriod      = config.idlePeriod    ?? 2800;
    this._walkThreshold   = config.walkThreshold ?? 10;
    this._bobTween        = null;
    this._leanTween       = null;
    this._legLTween       = null;
    this._legRTween       = null;
    this._idleTween       = null;
    this._breathTween     = null;

    const h = config.height ?? 72;

    // Автодетект paper doll по наличию разрезанных текстур
    if (scene.textures.exists(textureKey + '_upper')) {
      this._paperdoll = true;
      this._setupPaperdoll(x, y, textureKey, h);
    } else {
      this._paperdoll = false;
      this.sprite = scene.add.image(x, y, textureKey)
        .setOrigin(0.5, 1)
        .setDepth(y);
      const scale = h / this.sprite.height;
      this.sprite.setScale(scale);
      this._baseScale = scale;
    }

    // Тень под ногами
    this.shadow = scene.add.ellipse(x, y + 2, 28, 8, 0x000000, 0.25).setDepth(y - 1);

    this._startIdleAnim();
  }

  _setupPaperdoll(x, y, textureKey, targetH) {
    this._upper = this.scene.add.image(0, 0, textureKey + '_upper').setOrigin(0.5, 1);
    this._legL  = this.scene.add.image(0, 0, textureKey + '_leg_l').setOrigin(0.5, 0);
    this._legR  = this.scene.add.image(0, 0, textureKey + '_leg_r').setOrigin(0.5, 0);

    // Единый масштаб: upper.height + legL.height = оригинальная высота спрайта
    const s      = targetH / (this._upper.height + this._legL.height);
    this._baseScale = s;

    const legsH  = this._legL.height;   // высота нижней части в текселях
    const Wu     = this._upper.width;   // ширина оригинала (= ширина upper)
    const Wl     = this._legL.width;
    const Wr     = this._legR.width;
    const lsH    = legsH * s;          // высота ног в экранных пикселях

    // Торс опускается на OVERLAP пикселей ниже точки раздела — перекрывает
    // верх ног и скрывает зазор при ротации. При ±7° зазор в углу ~5px → 8px достаточно.
    const OVERLAP = 8;
    this._baseUpperY = -lsH + OVERLAP;
    this._upper.setScale(s).setPosition(0, this._baseUpperY);

    // Ноги: top-center привязан к точке раздела; pivot = бедро (origin 0.5,0)
    // legL центрируется на левой четверти оригинала: offset = (Wl - Wu)/2 * s
    // legR центрируется на правой четверти: offset = Wr/2 * s
    this._legL.setScale(s).setPosition(s * (Wl - Wu) / 2, -lsH);
    this._legR.setScale(s).setPosition(s * Wr / 2, -lsH);

    this._container = this.scene.add.container(x, y, [this._legL, this._legR, this._upper]);
    this._container.setDepth(y);

    // Прокси-объект для совместимости с внешним кодом MapScene
    const container = this._container;
    this.sprite = {
      get x()   { return container.x; },
      set x(v)  { container.x = v; },
      get y()   { return container.y; },
      set y(v)  { container.y = v; },
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
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 15) {
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
    const dx = this.targetX - this.sprite.x;
    const dy = this.targetY - this.sprite.y;
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
    if (this._bobTween) return;

    if (this._paperdoll) {
      const baseY = this._baseUpperY;

      // Лёгкий bob верхней части (±2px по Y, период 200ms)
      this._bobTween = this.scene.tweens.add({
        targets:  this._upper,
        y:        { from: baseY - 2, to: baseY + 2 },
        duration: 200,
        yoyo:     true,
        repeat:   -1,
        ease:     'Sine.easeInOut',
      });

      // Ноги в противофазе ±7° — минимальный угол без зазора, период 400ms
      this._legLTween = this.scene.tweens.add({
        targets:  this._legL,
        angle:    { from: -7, to: 7 },
        duration: 400,
        yoyo:     true,
        repeat:   -1,
        ease:     'Sine.easeInOut',
      });
      this._legRTween = this.scene.tweens.add({
        targets:  this._legR,
        angle:    { from: 7, to: -7 },
        duration: 400,
        yoyo:     true,
        repeat:   -1,
        ease:     'Sine.easeInOut',
      });
    } else {
      // Legacy: покачивание всего тела
      this._bobTween = this.scene.tweens.add({
        targets:  this.sprite,
        angle:    { from: -2.5, to: 2.5 },
        duration: 200,
        yoyo:     true,
        repeat:   -1,
        ease:     'Sine.easeInOut',
      });
    }

    // Пыль от шагов (общая для обоих режимов)
    this._dustTimer = this.scene.time.addEvent({
      delay:         200,
      loop:          true,
      callback:      this._spawnDust,
      callbackScope: this,
    });
  }

  _spawnDust() {
    const side = (Math.floor(this.scene.time.now / 200) % 2 === 0) ? -10 : 10;
    const x = this.sprite.x + side + Phaser.Math.Between(-4, 4);
    const y = this.sprite.y + 4;

    const dust = this.scene.add.ellipse(x, y, 22, 9, 0x9a8060, 0.7)
      .setDepth(this.sprite.y - 2);
    this.scene.tweens.add({
      targets:    dust,
      alpha:      0,
      scaleX:     2.8,
      scaleY:     0.2,
      y:          y - 4,
      duration:   380,
      ease:       'Power2',
      onComplete: () => dust.destroy(),
    });
  }

  _startIdleAnim() {
    if (this._idleTween) return;
    const s = this._baseScale;

    if (this._paperdoll) {
      this._upper.setScale(s).setPosition(0, this._baseUpperY);
      this._legL.setAngle(0);
      this._legR.setAngle(0);
      this._idleTween = this.scene.tweens.add({
        targets:  this._upper,
        scaleY:   { from: s * 0.998, to: s * 1.022 },
        duration: this._idlePeriod,
        yoyo:     true,
        repeat:   -1,
        ease:     'Sine.easeInOut',
      });
    } else {
      this.sprite.setAngle(0);
      this.sprite.setScale(s);
      this._idleTween = this.scene.tweens.add({
        targets:  this.sprite,
        scaleY:   { from: s * 0.998, to: s * 1.022 },
        duration: this._idlePeriod,
        yoyo:     true,
        repeat:   -1,
        ease:     'Sine.easeInOut',
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

    if (this._paperdoll) {
      const s = this._baseScale;
      this._legL.setAngle(0);
      this._legR.setAngle(0);
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
