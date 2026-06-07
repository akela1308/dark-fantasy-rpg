/**
 * MapUnit — персонаж на карте мира.
 * Движется к цели, анимируется программно (боб + покачивание).
 */
export class MapUnit {
  constructor(scene, x, y, textureKey, config = {}) {
    this.scene       = scene;
    this.speed       = config.speed ?? 120;
    this.targetX     = x;
    this.targetY     = y;
    this.moving      = false;
    this._idlePeriod    = config.idlePeriod    ?? 2800;
    this._walkThreshold = config.walkThreshold ?? 10;  // мин. дистанция для старта walk-анимации
    this._bobTween   = null;
    this._leanTween  = null;
    this._idleTween  = null;
    this._breathTween = null;

    // Спрайт
    this.sprite = scene.add.image(x, y, textureKey)
      .setOrigin(0.5, 1)
      .setDepth(10);

    // Масштаб под размер карты
    const h = config.height ?? 72;
    const scale = h / this.sprite.height;
    this.sprite.setScale(scale);

    // Тень под ногами
    this.shadow = scene.add.ellipse(x, y + 2, 28, 8, 0x000000, 0.25).setDepth(9);

    // Запускаем idle-анимацию сразу
    this._startIdleAnim();
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
    // Не трогаем moving/анимацию — update() управляет состоянием
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
      // Гистерезис: переходим в idle только если были moving
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

      // Гистерезис: walk-анимация стартует только при реальном движении (>10px)
      // Мелкие толчки от _separateParty (<5px) сюда не попадают
      if (!this.moving && dist > this._walkThreshold) {
        this.moving = true;
        this._stopIdleAnim();
        this._startWalkAnim();
      }
    }

    this.shadow.setPosition(this.sprite.x, this.sprite.y + 2);
  }

  _startWalkAnim() {
    if (this._bobTween) return;

    // Только угол — не трогаем y чтобы не конфликтовать с движением
    this._bobTween = this.scene.tweens.add({
      targets: this.sprite,
      angle: { from: -2.5, to: 2.5 },
      duration: 200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this._leanTween = null; // объединили с bobTween
  }

  _startIdleAnim() {
    if (this._idleTween) return;
    this.sprite.setAngle(0);
    const baseScale = this.sprite.scaleY;
    this._idleTween = this.scene.tweens.add({
      targets:  this.sprite,
      scaleY:   { from: baseScale * 0.998, to: baseScale * 1.022 },
      duration: this._idlePeriod,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
    });
  }

  _stopIdleAnim() {
    if (this._idleTween)  { this._idleTween.stop();  this._idleTween  = null; }
    if (this._breathTween) { this._breathTween.stop(); this._breathTween = null; }
  }

  _stopWalkAnim() {
    if (this._bobTween)  { this._bobTween.stop();  this._bobTween  = null; }
    if (this._leanTween) { this._leanTween.stop(); this._leanTween = null; }
    this.sprite.setAngle(0);
    this.sprite.setScale(this.sprite.scaleX, this.sprite.scaleY);
  }

  destroy() {
    this._stopWalkAnim();
    this._stopIdleAnim();
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
