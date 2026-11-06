/**
 * Резкость на больших экранах (Д23, Д39). Логический холст остаётся 1280×720: координаты, клики, окна и камеры не меняются.
 * Увеличивается только буфер WebGL: контекст получает масштабированные viewport и scissor, пока рисование идёт на экран.
 * Текст Phaser рисует в свою текстуру, поэтому у него поднимается resolution.
 * Масштаб 1, 1.5 или 2: по реальному числу точек на экране, не больше 2.
 */
import * as Phaser from 'phaser/dist/phaser.esm.js';

let R = 1;
export const hiResScale = () => R;

function wanted(h) {
  const px = window.innerHeight * (window.devicePixelRatio || 1);
  return Math.min(2, Math.max(1, Math.ceil((px / h) * 2) / 2));
}

/** Вызывать до создания игры: тексты получат нужное разрешение с первого кадра. */
export function prepareHiResText() {
  R = wanted(720);
  const init = Phaser.GameObjects.Text.prototype.setStyle;
  Phaser.GameObjects.Text.prototype.setStyle = function (style) {
    const r = init.call(this, style);
    if (this.style && this.style.resolution !== R) this.setResolution(R);
    return r;
  };
}

export function installHiRes(game) {
  const gl = game.renderer?.gl;
  if (!gl) { R = 1; return; }   // Canvas-рендер: без изменений
  const W = game.config.width, H = game.config.height;
  const viewport = gl.viewport.bind(gl), scissor = gl.scissor.bind(gl), bind = gl.bindFramebuffer.bind(gl);
  let screen = true;   // рисуем на экран, а не в текстуру: масштаб нужен только здесь
  gl.bindFramebuffer = (t, fb) => { if (t === gl.FRAMEBUFFER) screen = !fb; bind(t, fb); };
  gl.viewport = (x, y, w, h) => (screen ? viewport(x * R, y * R, w * R, h * R) : viewport(x, y, w, h));
  gl.scissor = (x, y, w, h) => (screen ? scissor(x * R, y * R, w * R, h * R) : scissor(x, y, w, h));
  const apply = () => {
    const c = game.canvas, cw = Math.round(W * R), ch = Math.round(H * R);
    if (c.width === cw && c.height === ch) return;
    c.width = cw; c.height = ch;
    viewport(0, 0, cw, ch);
  };
  apply();
  game.scale.refresh();
}
